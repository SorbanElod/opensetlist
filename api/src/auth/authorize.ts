import type { FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';

import type { Db } from '../db/index.js';
import { groupMembers } from '../db/schema.js';
import { SESSION_COOKIE, getUserBySessionToken } from './service.js';

// THE authorization choke point. Every protected route goes through this
// function — there are no inline role checks anywhere else. The thesis-phase
// capability dictionary will replace only this file's internals; the
// route-facing signature authorize(db, role) never changes.

export type GroupRole = 'reader' | 'member' | 'group_manager';

// The ladder as data: group_manager > member > reader is a single rank
// comparison instead of three if-branches. Nothing outside this file knows
// about ranks.
const ROLE_RANK: Record<GroupRole, number> = {
  reader: 0,
  member: 1,
  group_manager: 2,
};

export function authorize(db: Db, required: GroupRole) {
  return async function authorizeHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    // 1. Authenticate first: an anonymous probe gets 401, a logged-in user
    //    with insufficient role gets 403. One choke point owns both.
    const token = request.cookies[SESSION_COOKIE];
    const user = token ? await getUserBySessionToken(db, token) : null;

    if (!user) {
      return reply.code(401).send({ message: 'Not authenticated' });
    }

    // Expose the user to the handler — handlers never re-query the session.
    request.user = user;

    // 2. Platform axis: superadmins support every group and bypass group
    //    checks entirely. is_superadmin is on users, NEVER a group role.
    if (user.isSuperadmin) {
      return;
    }

    // 3. Group axis: MVP has a single group, so a user has at most one
    //    membership row. No membership or insufficient rank -> 403.
    const [membership] = await db
      .select()
      .from(groupMembers)
      .where(eq(groupMembers.userId, user.id));

    if (!membership || ROLE_RANK[membership.role] < ROLE_RANK[required]) {
      return reply.code(403).send({ message: 'Forbidden' });
    }
  };
}
