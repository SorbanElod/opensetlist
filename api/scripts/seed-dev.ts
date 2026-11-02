import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { and, eq } from 'drizzle-orm';

import { hashPassword } from '../src/auth/service.js';
import { loadEnv } from '../src/config.js';
import { buildDb, type Db } from '../src/db/index.js';
import { groupMembers, groups, songs, tags, users } from '../src/db/schema.js';
import { importSongsSchema } from '../src/songs/schemas.js';
import { getSingleGroupId, importSongs } from '../src/songs/service.js';

const here = dirname(fileURLToPath(import.meta.url));
const SEED_FILE = join(here, '..', 'fixtures', 'dev-seed.json');

// The deterministic dev login, created/reset by every db:seed run so a
// manual test pass always starts from the same group manager. The password
// is deliberately weak — dev-only, the script refuses to run in production
// and the register endpoint keeps its own 10-char policy.
export const DEV_ADMIN = {
  name: 'Admin',
  email: 'admin@opensetlist.local',
  password: 'admin',
} as const;

// Idempotent: creates the single group on a fresh DB, upserts the admin user
// (resetting the password to DEV_ADMIN.password), and ensures the membership
// is group_manager. Returns the admin's user id.
export async function ensureDevAdmin(db: Db): Promise<string> {
  let [group] = await db.select().from(groups).limit(1);
  group ??= (
    await db.insert(groups).values({ name: 'Main Group' }).returning()
  )[0]!;

  const passwordHash = await hashPassword(DEV_ADMIN.password);
  const [user] = await db
    .insert(users)
    .values({
      email: DEV_ADMIN.email,
      name: DEV_ADMIN.name,
      passwordHash,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: { name: DEV_ADMIN.name, passwordHash },
    })
    .returning();

  const [membership] = await db
    .select()
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, group.id),
        eq(groupMembers.userId, user!.id),
      ),
    );
  if (membership) {
    if (membership.role !== 'group_manager') {
      await db
        .update(groupMembers)
        .set({ role: 'group_manager' })
        .where(eq(groupMembers.id, membership.id));
    }
  } else {
    await db.insert(groupMembers).values({
      groupId: group.id,
      userId: user!.id,
      role: 'group_manager',
    });
  }

  return user!.id;
}

// Dev-only library reset: delete the group's songs (arrangements and
// song_tags cascade) and its tag vocabulary. Users/sessions are untouched.
export async function clearGroupLibrary(db: Db, groupId: string) {
  await db.delete(songs).where(eq(songs.groupId, groupId));
  await db.delete(tags).where(eq(tags.groupId, groupId));
}

// Wipe + import the curated public-domain seed, after ensuring the
// deterministic dev admin exists. The import goes through the same schema +
// service as POST /api/songs/import, so a broken seed file fails loudly here
// instead of in the UI.
export async function seedDev(db: Db) {
  const ownerId = await ensureDevAdmin(db);
  const groupId = await getSingleGroupId(db);

  const raw = JSON.parse(await readFile(SEED_FILE, 'utf8')) as unknown;
  const data = importSongsSchema.parse(raw);

  await clearGroupLibrary(db, groupId);
  const result = await importSongs(db, {
    groupId,
    ownerId,
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
    console.log(
      `Dev admin login: ${DEV_ADMIN.email} / ${DEV_ADMIN.password} (group_manager)`,
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
