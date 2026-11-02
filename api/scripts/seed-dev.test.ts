import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { and, count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  clearGroupLibrary,
  DEV_ADMIN,
  ensureDevAdmin,
  seedDev,
} from './seed-dev.js';
import { importSongsSchema } from '../src/songs/schemas.js';
import { verifyPassword } from '../src/auth/service.js';
import {
  arrangements,
  groupMembers,
  songs,
  tags,
  users,
} from '../src/db/schema.js';
import { buildTestDb } from '../src/test-utils/db.js';
import { getSingleGroupId } from '../src/songs/service.js';

const here = dirname(fileURLToPath(import.meta.url));
const SEED_FILE = join(here, '..', 'fixtures', 'dev-seed.json');

// The fixture itself must always be importable and well-formed — this runs
// without a database.
describe('dev-seed fixture', () => {
  it('parses through importSongsSchema and is curated public-domain content', async () => {
    const raw = JSON.parse(await readFile(SEED_FILE, 'utf8')) as unknown;
    const data = importSongsSchema.parse(raw); // throws on a broken seed

    expect(data.songs.length).toBeGreaterThanOrEqual(12);
    // Multi-arrangement songs exercise the arrangement switcher.
    expect(data.songs.some((s) => (s.arrangements?.length ?? 0) >= 2)).toBe(
      true,
    );
    let instrumental = 0;
    for (const song of data.songs) {
      expect(song.title.trim().length).toBeGreaterThan(0);
      expect(song.arrangements?.length).toBeGreaterThanOrEqual(1);
      for (const arrangement of song.arrangements ?? []) {
        expect(arrangement.defaultSequence.length).toBeGreaterThan(0);
        for (const entry of arrangement.defaultSequence) {
          expect(arrangement.sections.map((s) => s.label)).toContain(entry);
        }
        for (const section of arrangement.sections) {
          // Every section is renderable ABC with chords, so sheet and chords
          // views (#10) have something to show; vocal sections add w: lyrics.
          expect(section.content).toContain('K:');
          expect(section.content).toMatch(/"[A-G]/); // quoted chord symbol
          if (!/^w:/m.test(section.content)) instrumental += 1;
        }
      }
    }
    // At least one instrumental piece covers the no-lyrics path.
    expect(instrumental).toBeGreaterThanOrEqual(1);
  });
});

// Integration: seed then clear against a real Postgres. Skipped without
// DATABASE_URL like the other integration suites. Ends with the library
// cleared so other test files (which create their own songs) are unaffected
// regardless of file order.
const dbUrl = process.env.DATABASE_URL;

describe.skipIf(!dbUrl)('seedDev / clearGroupLibrary', () => {
  let db: Awaited<ReturnType<typeof buildTestDb>>['db'];
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await buildTestDb(dbUrl!));
  });

  afterAll(async () => {
    const groupId = await getSingleGroupId(db);
    await clearGroupLibrary(db, groupId); // leave the test DB empty
    await close();
  });

  it('ensures the deterministic dev admin (group_manager, password admin)', async () => {
    const adminId = await ensureDevAdmin(db);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, DEV_ADMIN.email));
    expect(user).toBeTruthy();
    expect(user!.id).toBe(adminId);
    expect(user!.name).toBe(DEV_ADMIN.name);
    expect(await verifyPassword(DEV_ADMIN.password, user!.passwordHash!)).toBe(
      true,
    );

    const groupId = await getSingleGroupId(db);
    const [membership] = await db
      .select()
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, adminId),
        ),
      );
    expect(membership?.role).toBe('group_manager');

    // Idempotent: a second run keeps the same login working.
    await ensureDevAdmin(db);
    const [again] = await db
      .select()
      .from(users)
      .where(eq(users.email, DEV_ADMIN.email));
    expect(await verifyPassword(DEV_ADMIN.password, again!.passwordHash!)).toBe(
      true,
    );
  });

  it('wipes and re-imports the curated seed idempotently, owned by the admin', async () => {
    const groupId = await getSingleGroupId(db);

    const first = await seedDev(db);
    expect(first.songs).toBeGreaterThanOrEqual(12);
    expect(first.arrangements).toBeGreaterThanOrEqual(12);

    const [admin] = await db
      .select()
      .from(users)
      .where(eq(users.email, DEV_ADMIN.email));
    const owned = await db
      .select({ n: count() })
      .from(songs)
      .where(eq(songs.ownerId, admin!.id));
    expect(owned[0]?.n).toBe(first.songs);

    const songCount = async () => {
      const rows = await db
        .select({ n: count() })
        .from(songs)
        .where(eq(songs.groupId, groupId));
      return rows[0]?.n ?? 0;
    };
    const arrangementCount = async () => {
      const rows = await db.select({ n: count() }).from(arrangements);
      return rows[0]?.n ?? 0;
    };

    expect(await songCount()).toBe(first.songs);
    expect(await arrangementCount()).toBe(first.arrangements);

    // Re-running replaces, not appends.
    const second = await seedDev(db);
    expect(await songCount()).toBe(second.songs);
    expect(second.songs).toBe(first.songs);

    // Clear empties the library (arrangements cascade with their songs).
    await clearGroupLibrary(db, groupId);
    expect(await songCount()).toBe(0);
    expect(await arrangementCount()).toBe(0);
    const tagRows = await db
      .select({ n: count() })
      .from(tags)
      .where(eq(tags.groupId, groupId));
    expect(tagRows[0]?.n ?? 0).toBe(0);
  });
});
