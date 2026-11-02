import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';

import { loadEnv } from '../src/config.js';
import { buildDb, type Db } from '../src/db/index.js';
import { groupMembers, songs, tags } from '../src/db/schema.js';
import { importSongsSchema } from '../src/songs/schemas.js';
import { getSingleGroupId, importSongs } from '../src/songs/service.js';

const here = dirname(fileURLToPath(import.meta.url));
const SEED_FILE = join(here, '..', 'fixtures', 'dev-seed.json');

// Dev-only library reset: delete the group's songs (arrangements and
// song_tags cascade) and its tag vocabulary. Users/sessions are untouched.
export async function clearGroupLibrary(db: Db, groupId: string) {
  await db.delete(songs).where(eq(songs.groupId, groupId));
  await db.delete(tags).where(eq(tags.groupId, groupId));
}

// Wipe + import the curated public-domain seed. The import goes through the
// same schema + service as POST /api/songs/import, so a broken seed file
// fails loudly here instead of in the UI.
export async function seedDev(db: Db) {
  const groupId = await getSingleGroupId(db);

  // The import needs an owner; the seed is owned by the group's manager.
  const members = await db
    .select()
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId));
  const owner = members.find((m) => m.role === 'group_manager') ?? members[0];
  if (!owner) {
    throw new Error('No group members — register a user first, then re-run.');
  }

  const raw = JSON.parse(await readFile(SEED_FILE, 'utf8')) as unknown;
  const data = importSongsSchema.parse(raw);

  await clearGroupLibrary(db, groupId);
  const result = await importSongs(db, {
    groupId,
    ownerId: owner.userId,
    data,
  });

  return {
    songs: result.songs.length,
    arrangements: result.arrangementsImported,
    tags: result.tagsImported,
  };
}

// CLI entry: pnpm -C api db:seed — run before a manual test pass so the dev
// instance starts from the curated seed, not leftover junk.
async function main() {
  const env = loadEnv();
  if (env.NODE_ENV === 'production') {
    console.error('db:seed is dev-only — refusing to run in production.');
    process.exit(1);
  }

  const { db, close } = buildDb(env.DATABASE_URL);
  try {
    const counts = await seedDev(db);
    console.log(
      `Seeded dev database: ${counts.songs} songs, ${counts.arrangements} arrangements, ${counts.tags} tag links (from ${SEED_FILE})`,
    );
  } finally {
    await close();
  }
}

// Run as a script, not when imported by tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
