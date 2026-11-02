import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { clearGroupLibrary, seedDev } from './seed-dev.js';
import { importSongsSchema } from '../src/songs/schemas.js';
import { arrangements, songs, tags } from '../src/db/schema.js';
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

    expect(data.songs.length).toBeGreaterThanOrEqual(6);
    for (const song of data.songs) {
      expect(song.title.trim().length).toBeGreaterThan(0);
      expect(song.arrangements?.length).toBeGreaterThanOrEqual(1);
      for (const arrangement of song.arrangements ?? []) {
        expect(arrangement.defaultSequence.length).toBeGreaterThan(0);
        for (const entry of arrangement.defaultSequence) {
          expect(arrangement.sections.map((s) => s.label)).toContain(entry);
        }
        for (const section of arrangement.sections) {
          // Every section is renderable ABC with chords and lyrics, so all
          // three views (#10) have something to show.
          expect(section.content).toContain('K:');
          expect(section.content).toMatch(/"[A-G]/); // quoted chord symbol
          expect(section.content).toMatch(/^w:/m); // lyric line
        }
      }
    }
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

  it('wipes and re-imports the curated seed idempotently', async () => {
    const groupId = await getSingleGroupId(db);

    const first = await seedDev(db);
    expect(first.songs).toBeGreaterThanOrEqual(6);
    expect(first.arrangements).toBeGreaterThanOrEqual(6);

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
