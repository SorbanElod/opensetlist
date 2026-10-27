import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import * as schema from './schema.js';

// Metadata-level checks (no DB connection): the schema is the contract the
// whole app builds on, so we pin its shape here.
function tableNames(): string[] {
  return Object.values(schema)
    .filter((value) => is(value, PgTable))
    .map((table) => getTableConfig(table).name)
    .sort();
}

describe('schema', () => {
  it('defines exactly the 10 tables of the MVP data model', () => {
    expect(tableNames()).toEqual([
      'arrangements',
      'group_members',
      'groups',
      'sessions',
      'setlist_items',
      'setlists',
      'song_tags',
      'songs',
      'tags',
      'users',
    ]);
  });

  it('carries an optimistic-locking version column on mutable entities', () => {
    for (const table of [schema.songs, schema.arrangements, schema.setlists]) {
      const config = getTableConfig(table);

      const version = config.columns.find((c) => c.name === 'version');
      expect(version, `${config.name}.version`).toBeDefined();
      expect(version?.notNull, `${config.name}.version NOT NULL`).toBe(true);
    }
  });

  it('gives song_tags a composite primary key', () => {
    const { primaryKeys } = getTableConfig(schema.songTags);

    expect(primaryKeys).toHaveLength(1);
    expect(primaryKeys[0]?.columns.map((c) => c.name)).toEqual([
      'song_id',
      'tag_id',
    ]);
  });
});
