import { and, eq } from 'drizzle-orm';

import type { Db } from '../db/index.js';
import { groupMembers, groups, users } from '../db/schema.js';
import type { GroupRole } from '../auth/authorize.js';

export type MemberView = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: GroupRole;
};

export type MemberResult =
  | { ok: true; member: MemberView }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'last_manager' };

// The service takes groupId explicitly (not "the" group): multi-group later
// reuses every function unchanged, and tests can run against isolated
// groups instead of the shared single one.

export async function listMembers(
  db: Db,
  groupId: string,
): Promise<MemberView[]> {
  const rows = await db
    .select({
      id: groupMembers.id,
      userId: groupMembers.userId,
      name: users.name,
      email: users.email,
      role: groupMembers.role,
    })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(eq(groupMembers.groupId, groupId));

  return rows;
}

// Last-manager lockout guard: a group must always keep at least one
// group_manager, otherwise nobody could ever manage members again (short of
// a superadmin or manual SQL). The check runs in the same transaction as
// the change. Known edge, documented for the thesis: two concurrent
// demotions of the last two managers can both pass the count — irrelevant
// at alpha scale, and the guard makes accidental lockout through the UI
// impossible.
async function guardLastManager(
  tx: Parameters<Parameters<Db['transaction']>[0]>[0],
  groupId: string,
  targetMemberId: string,
): Promise<boolean> {
  const [target] = await tx
    .select()
    .from(groupMembers)
    .where(eq(groupMembers.id, targetMemberId))
    .limit(1);

  if (!target || target.role !== 'group_manager') {
    return true; // target is not a manager: no lockout risk
  }

  const managers = await tx
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.role, 'group_manager'),
      ),
    );

  return managers.length > 1; // more than one manager: safe to demote/remove
}

export async function changeMemberRole(
  db: Db,
  input: { groupId: string; memberId: string; role: GroupRole },
): Promise<MemberResult> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(groupMembers)
      .where(eq(groupMembers.id, input.memberId))
      .limit(1);

    if (!existing || existing.groupId !== input.groupId) {
      return { ok: false, reason: 'not_found' as const };
    }

    if (!(await guardLastManager(tx, input.groupId, input.memberId))) {
      return { ok: false, reason: 'last_manager' as const };
    }

    await tx
      .update(groupMembers)
      .set({ role: input.role })
      .where(eq(groupMembers.id, input.memberId));

    return memberView(tx, input.memberId);
  });
}

export async function removeMember(
  db: Db,
  input: { groupId: string; memberId: string },
): Promise<MemberResult> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(groupMembers)
      .where(eq(groupMembers.id, input.memberId))
      .limit(1);

    if (!existing || existing.groupId !== input.groupId) {
      return { ok: false, reason: 'not_found' as const };
    }

    if (!(await guardLastManager(tx, input.groupId, input.memberId))) {
      return { ok: false, reason: 'last_manager' as const };
    }

    // Read the view before deleting — after the delete the row is gone.
    const result = await memberView(tx, input.memberId);
    if (!result.ok) return result;

    await tx.delete(groupMembers).where(eq(groupMembers.id, input.memberId));

    return result;
  });
}

async function memberView(
  tx: Parameters<Parameters<Db['transaction']>[0]>[0],
  memberId: string,
): Promise<MemberResult> {
  const [member] = await tx
    .select({
      id: groupMembers.id,
      userId: groupMembers.userId,
      name: users.name,
      email: users.email,
      role: groupMembers.role,
    })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(eq(groupMembers.id, memberId))
    .limit(1);

  return member ? { ok: true, member } : { ok: false, reason: 'not_found' };
}

// The MVP's single hardcoded group. Routes resolve it here once; when
// multi-group arrives post-alpha, routes resolve the group from the
// resource being accessed instead.
export async function getSingleGroupId(db: Db): Promise<string> {
  const [group] = await db.select().from(groups).limit(1);

  if (!group) {
    throw new Error('No group exists yet — register a user first');
  }

  return group.id;
}
