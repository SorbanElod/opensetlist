import { hash, verify } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';

import { groupMembers, groups, sessions, users } from '../db/schema.js';
import type { Db } from '../db/index.js';
import type { RegisterInput } from './schemas.js';

// OWASP-recommended Argon2id parameters: 19 MiB memory, 2 passes, 1 thread.
// These are the settings to cite in the thesis.
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export const SESSION_COOKIE = 'opensetlist_session';
export const SESSION_TTL_DAYS = 30;

// The MVP's single group. Multi-group arrives post-alpha; until then the
// app layer enforces exactly one group, created lazily by the first
// registration.
const SINGLE_GROUP_NAME = 'Main Group';

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  isSuperadmin: boolean;
};

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

// argon2's verify takes the stored hash first, the candidate password second.
export function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return verify(passwordHash, password);
}

export function hashSessionToken(token: string): string {
  // SHA-256, not Argon2: the token is 256-bit random, so brute-forcing its
  // hash is infeasible — and this runs on every request, so it must be fast.
  return createHash('sha256').update(token).digest('hex');
}

export function newSessionToken(): { token: string; tokenHash: string } {
  // base64url: URL-safe and cookie-safe, no padding characters.
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashSessionToken(token) };
}

export function sessionExpiry(): Date {
  return new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

// The raw token exists only in the return value and the user's cookie —
// the DB row stores only tokenHash.
export async function createSession(
  db: Db,
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const { token, tokenHash } = newSessionToken();
  const expiresAt = sessionExpiry();

  await db.insert(sessions).values({ userId, tokenHash, expiresAt });

  return { token, expiresAt };
}

export async function revokeSession(db: Db, token: string): Promise<void> {
  await db
    .delete(sessions)
    .where(eq(sessions.tokenHash, hashSessionToken(token)));
}

// Opportunistic cleanup (no pg-boss in the MVP): every successful login
// sweeps this user's expired rows.
export async function deleteExpiredSessions(
  db: Db,
  userId: string,
): Promise<void> {
  await db
    .delete(sessions)
    .where(
      and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date())),
    );
}

// Cookie -> user for authenticated requests. The expires_at > now() check
// lives in SQL, so an expired token is indistinguishable from no token.
export async function getUserBySessionToken(
  db: Db,
  token: string,
): Promise<PublicUser | null> {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      isSuperadmin: users.isSuperadmin,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, hashSessionToken(token)),
        gt(sessions.expiresAt, new Date()),
      ),
    );

  return row ?? null;
}

// One transaction: user + group + membership together, so a crash can never
// leave a user without a group. The first member ever becomes group_manager
// (the standard first-user-is-admin bootstrap); everyone else joins as member.
// Known MVP gap: two simultaneous first registrations could both see an empty
// group_members table — irrelevant at alpha scale, noted for the thesis.
export async function registerUser(
  db: Db,
  input: RegisterInput & { passwordHash: string },
): Promise<PublicUser> {
  return db.transaction(async (tx) => {
    const [existingGroup] = await tx.select().from(groups).limit(1);
    const group =
      existingGroup ??
      (
        await tx.insert(groups).values({ name: SINGLE_GROUP_NAME }).returning()
      )[0]!;

    const [existingMember] = await tx
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, group.id))
      .limit(1);

    const role = existingMember ? 'member' : 'group_manager';

    const [user] = await tx
      .insert(users)
      .values({
        email: input.email,
        name: input.name,
        passwordHash: input.passwordHash,
      })
      .returning();

    await tx
      .insert(groupMembers)
      .values({ groupId: group.id, userId: user!.id, role });

    return {
      id: user!.id,
      email: user!.email,
      name: user!.name,
      isSuperadmin: user!.isSuperadmin,
    };
  });
}

// Login: find by email, verify with Argon2. One message for unknown email and
// wrong password so the API does not confirm which emails exist. The small
// timing difference between the two paths is deliberate P4 hardening scope.
export async function authenticateUser(
  db: Db,
  email: string,
  password: string,
): Promise<PublicUser | null> {
  const [user] = await db.select().from(users).where(eq(users.email, email));

  if (!user || !user.passwordHash) return null;

  const ok = await verifyPassword(password, user.passwordHash);

  if (!ok) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isSuperadmin: user.isSuperadmin,
  };
}
