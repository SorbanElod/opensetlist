import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

// One section of an arrangement, e.g. { label: 'Verse 1', content: 'X:1...' }.
// The shape lives here once — schema.ts is the single source the API and
// the tests import.
export type ArrangementSection = {
  label: string;
  content: string; // ABC Notation text
};

// Group-scoped role ladder: group_manager > member > reader.
// Platform superadmin is users.is_superadmin — never a value here.
export const groupRole = pgEnum('group_role', [
  'group_manager',
  'member',
  'reader',
]);

// Designed for the full model; the MVP enforces 'group' at the app layer.
export const songVisibility = pgEnum('song_visibility', [
  'private',
  'group',
  'public',
]);

// Preferred on-stage view (issue #10): 'sheet' (full notation), 'chords'
// (chord chart, no staff) or 'lyrics' (words only). The arrangement view
// page defaults to this; manual switching during a session stays
// client-side and never touches the DB.
export const defaultView = pgEnum('default_view', [
  'sheet',
  'chords',
  'lyrics',
]);

// Users. password_hash is nullable for future Google-only accounts;
// for local accounts it is NOT NULL in practice (enforced by the auth layer).
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  name: text('name').notNull(),
  passwordHash: text('password_hash'),
  googleId: text('google_id').unique(),
  isSuperadmin: boolean('is_superadmin').notNull().default(false),
  defaultView: defaultView('default_view').notNull().default('chords'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Sessions. The DB stores only the token hash; the raw token never
// leaves the cookie.
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);

// Groups (tenants). MVP ships a single hardcoded row.
export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Membership: which user has which role in which group.
export const groupMembers = pgTable(
  'group_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: groupRole('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('group_members_group_user_uq').on(t.groupId, t.userId),
    index('group_members_group_id_idx').on(t.groupId),
    index('group_members_user_id_idx').on(t.userId),
  ],
);

// Songs: abstract identity + metadata. Musical content lives in arrangements.
// version: optimistic locking counter — every update must check-and-bump.
export const songs = pgTable(
  'songs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    author: text('author'),
    defaultKey: text('default_key').notNull(),
    // ISO 639-1 code ("hu", "en"), nullable: language is an attribute of the
    // song, not a tag — it is filtered on, not browsed as a label.
    language: text('language'),
    visibility: songVisibility('visibility').notNull().default('group'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('songs_group_id_idx').on(t.groupId)],
);

// Tags: group-scoped vocabulary. Cross-group sharing is post-alpha.
export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    name: text('name').notNull(), // already lowercase-normalized by the app
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('tags_group_name_uq').on(t.groupId, t.name),
    index('tags_group_id_idx').on(t.groupId),
  ],
);

// Junction: composite PK, both sides cascade.
export const songTags = pgTable(
  'song_tags',
  {
    songId: uuid('song_id')
      .notNull()
      .references(() => songs.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [
    // Composite PK also covers the FKs, so no extra indexes needed here.
    primaryKey({ columns: [t.songId, t.tagId] }),
  ],
);

// Arrangements: musical variants of a song. sections is the only JSONB
// column in the model — the ABC content blocks.
export const arrangements = pgTable(
  'arrangements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    songId: uuid('song_id')
      .notNull()
      .references(() => songs.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    originalKey: text('original_key').notNull(),
    bpm: integer('bpm'),
    // text[] (Postgres-native array), not JSON-in-text: the sequence holds
    // section labels, and a real array column stays queryable SQL while
    // Drizzle maps it to string[] with no parsing. Changed from text in
    // the P2.3 migration (approved in issue #9 discussion).
    defaultSequence: text('default_sequence').array().notNull(),
    sections: jsonb('sections').$type<ArrangementSection[]>().notNull(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('arrangements_song_id_idx').on(t.songId)],
);

// Setlists: an ordered song selection for one event.
export const setlists = pgTable(
  'setlists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    eventDate: date('event_date'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('setlists_group_id_idx').on(t.groupId)],
);

// Setlist items: child table (never an embedded array). position is unique
// per setlist, so ordering is unambiguous. Deleting a song removes its
// arrangements and thus their items (cascade) — chosen over failing the
// delete with a confusing error.
export const setlistItems = pgTable(
  'setlist_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    setlistId: uuid('setlist_id')
      .notNull()
      .references(() => setlists.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    arrangementId: uuid('arrangement_id')
      .notNull()
      .references(() => arrangements.id, { onDelete: 'cascade' }),
    transposedKey: text('transposed_key'),
    customSequence: text('custom_sequence'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('setlist_items_setlist_position_uq').on(t.setlistId, t.position),
    index('setlist_items_setlist_id_idx').on(t.setlistId),
    index('setlist_items_arrangement_id_idx').on(t.arrangementId),
  ],
);
