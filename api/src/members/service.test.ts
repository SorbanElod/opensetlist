import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { changeMemberRole, removeMember } from './service.js';
import { groupMembers, groups, users } from '../db/schema.js';
import { buildTestDb } from '../test-utils/db.js';

// Lockout guard at the service level, in an isolated throwaway group: the
// guard's premise ("exactly one manager") can only be guaranteed on a group
// this test owns — the shared single group may have managers from earlier
// runs. Each test gets a fresh group, so runs never interfere.
const dbUrl = process.env.DATABASE_URL;

describe.skipIf(!dbUrl)('last-manager lockout guard', () => {
  let db: Awaited<ReturnType<typeof buildTestDb>>['db'];
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await buildTestDb(dbUrl!));
  });

  afterAll(async () => {
    await close();
  });

  // A throwaway group with members in the given roles; returns membership
  // row ids for targeted operations. CASCADE deletes clean up the members
  // when the group goes away.
  async function groupWithManagers(managerCount: number) {
    const [group] = await db
      .insert(groups)
      .values({ name: `guard-test-${randomUUID()}` })
      .returning();

    const managers: string[] = [];
    for (let i = 0; i < managerCount; i++) {
      const [user] = await db
        .insert(users)
        .values({ email: `${randomUUID()}@example.com`, name: 'Guard Test' })
        .returning();
      const [membership] = await db
        .insert(groupMembers)
        .values({ groupId: group!.id, userId: user!.id, role: 'group_manager' })
        .returning();
      managers.push(membership!.id);
    }

    return { groupId: group!.id, managers };
  }

  it('refuses to demote the only group_manager', async () => {
    const { groupId, managers } = await groupWithManagers(1);

    const result = await changeMemberRole(db, {
      groupId,
      memberId: managers[0]!,
      role: 'member',
    });

    expect(result).toEqual({ ok: false, reason: 'last_manager' });
  });

  it('refuses to remove the only group_manager', async () => {
    const { groupId, managers } = await groupWithManagers(1);

    const result = await removeMember(db, {
      groupId,
      memberId: managers[0]!,
    });

    expect(result).toEqual({ ok: false, reason: 'last_manager' });
  });

  it('allows demoting and removing one of several group_managers', async () => {
    const demoteGroup = await groupWithManagers(2);
    const removeGroup = await groupWithManagers(2);

    const demoted = await changeMemberRole(db, {
      groupId: demoteGroup.groupId,
      memberId: demoteGroup.managers[0]!,
      role: 'member',
    });
    expect(demoted.ok).toBe(true);
    expect(demoted.ok && demoted.member.role).toBe('member');

    const removed = await removeMember(db, {
      groupId: removeGroup.groupId,
      memberId: removeGroup.managers[0]!,
    });
    expect(removed.ok).toBe(true);
    expect(removed.ok && removed.member.id).toBe(removeGroup.managers[0]);
  });

  it('returns not_found for an id from a different group', async () => {
    const own = await groupWithManagers(2);
    const other = await groupWithManagers(1);

    // A valid membership id — but scoped to the other group's context.
    const result = await removeMember(db, {
      groupId: own.groupId,
      memberId: other.managers[0]!,
    });

    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });
});
