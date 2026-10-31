import type { FastifyPluginAsync } from 'fastify';

import { authorize } from '../auth/authorize.js';
import type { Db } from '../db/index.js';
import { getSingleGroupId } from '../songs/service.js';
import * as tags from './service.js';

type TagsOptions = { db: Db };

export const tagsRoutes: FastifyPluginAsync<TagsOptions> = async (
  app,
  { db },
) => {
  // The group's tag vocabulary — autocomplete source for the song form.
  app.get('/api/tags', { preHandler: authorize(db, 'reader') }, async () => {
    const groupId = await getSingleGroupId(db);
    return { tags: await tags.listTags(db, groupId) };
  });

  // Deleting a tag removes it from every song (song_tags cascades).
  // group_manager only — vocabulary changes are a manager decision;
  // members add tags inline via the song form instead.
  app.delete<{ Params: { id: string } }>(
    '/api/tags/:id',
    { preHandler: authorize(db, 'group_manager') },
    async (request, reply) => {
      const groupId = await getSingleGroupId(db);
      const result = await tags.deleteTag(db, groupId, request.params.id);

      if (!result.ok) {
        return reply.code(404).send({ message: 'Tag not found' });
      }

      return { status: 'ok' };
    },
  );
};
