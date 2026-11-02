import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import type { ZodError } from 'zod';
import { z } from 'zod';

import { groupMembers } from '../db/schema.js';
import type { Db } from '../db/index.js';
import { loginSchema, registerSchema, updateMeSchema } from './schemas.js';
import * as auth from './service.js';

type AuthOptions = { db: Db };

const INVALID_CREDENTIALS = 'Invalid email or password';

// Postgres unique-violation code. drizzle wraps the driver error, so the
// code may sit on the wrapper's `cause` instead of the error itself.
function isUniqueViolation(error: unknown): boolean {
  const candidate = (error as { cause?: unknown })?.cause ?? error;
  return (candidate as { code?: string })?.code === '23505';
}

function invalidInput(reply: FastifyReply, error: ZodError) {
  return reply.code(400).send({
    message: 'Invalid input',
    issues: error.issues.map((issue) => ({
      // JSON path like "email" or "password" — fine to reveal, it is
      // validation feedback for the client.
      path: issue.path.join('.'),
      message: issue.message,
    })),
  });
}

export const authRoutes: FastifyPluginAsync<AuthOptions> = async (
  app,
  { db },
) => {
  // Role per group, as an array: the MVP has a single group so this is a
  // one-element array, but the shape is already multi-group-ready — a user
  // in several groups gets one entry per group, each with its own role.
  const membershipsFor = (userId: string) =>
    db
      .select({ groupId: groupMembers.groupId, role: groupMembers.role })
      .from(groupMembers)
      .where(eq(groupMembers.userId, userId));

  const cookieOptions = {
    path: '/',
    httpOnly: true, // JS in the browser can never read the session token
    sameSite: 'lax' as const, // blocks cross-site POSTs using the cookie
  };

  app.post('/api/auth/register', async (request, reply) => {
    let body: z.infer<typeof registerSchema>;
    try {
      body = registerSchema.parse(request.body);
    } catch (error) {
      return invalidInput(reply, error as ZodError);
    }

    const passwordHash = await auth.hashPassword(body.password);

    let user: auth.PublicUser;
    try {
      user = await auth.registerUser(db, { ...body, passwordHash });
    } catch (error) {
      // A concurrent register beat us to the email.
      if (isUniqueViolation(error)) {
        return reply.code(409).send({ message: 'Email already registered' });
      }
      throw error;
    }

    // Auto-login on register: the account is immediately usable.
    const session = await auth.createSession(db, user.id);

    reply.setCookie(auth.SESSION_COOKIE, session.token, {
      ...cookieOptions,
      maxAge: auth.SESSION_TTL_DAYS * 24 * 60 * 60,
    });

    return reply
      .code(201)
      .send({ user, memberships: await membershipsFor(user.id) });
  });

  app.post('/api/auth/login', async (request, reply) => {
    let body: z.infer<typeof loginSchema>;
    try {
      body = loginSchema.parse(request.body);
    } catch {
      // Same message as a failed login: don't leak which emails exist.
      return reply.code(401).send({ message: INVALID_CREDENTIALS });
    }

    const user = await auth.authenticateUser(db, body.email, body.password);

    if (!user) {
      return reply.code(401).send({ message: INVALID_CREDENTIALS });
    }

    await auth.deleteExpiredSessions(db, user.id);
    const session = await auth.createSession(db, user.id);

    reply.setCookie(auth.SESSION_COOKIE, session.token, {
      ...cookieOptions,
      maxAge: auth.SESSION_TTL_DAYS * 24 * 60 * 60,
    });

    return reply.send({ user, memberships: await membershipsFor(user.id) });
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[auth.SESSION_COOKIE];

    if (token) {
      await auth.revokeSession(db, token);
    }

    reply.clearCookie(auth.SESSION_COOKIE, { path: '/' });

    return reply.send({ status: 'ok' });
  });

  app.get('/api/auth/me', async (request, reply) => {
    const token = request.cookies[auth.SESSION_COOKIE];
    const user = token ? await auth.getUserBySessionToken(db, token) : null;

    if (!user) {
      return reply.code(401).send({ message: 'Not authenticated' });
    }

    return reply.send({ user, memberships: await membershipsFor(user.id) });
  });

  // Self-service profile update (issue #10): the session owner's own
  // default_view. Not a group resource, so it sits next to GET /me with the
  // same cookie check instead of behind authorize() — there is no group
  // role that could own "my own preference".
  app.patch('/api/auth/me', async (request, reply) => {
    const token = request.cookies[auth.SESSION_COOKIE];
    const sessionUser = token
      ? await auth.getUserBySessionToken(db, token)
      : null;

    if (!sessionUser) {
      return reply.code(401).send({ message: 'Not authenticated' });
    }

    let body: z.infer<typeof updateMeSchema>;
    try {
      body = updateMeSchema.parse(request.body);
    } catch (error) {
      return invalidInput(reply, error as ZodError);
    }

    const user = await auth.updateDefaultView(
      db,
      sessionUser.id,
      body.defaultView,
    );

    if (!user) {
      return reply.code(401).send({ message: 'Not authenticated' });
    }

    return reply.send({ user, memberships: await membershipsFor(user.id) });
  });
};
