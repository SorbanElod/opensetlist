import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import type { ZodError } from 'zod';
import { z } from 'zod';

import { authorize } from '../auth/authorize.js';
import type { Db } from '../db/index.js';
import { getSingleGroupId } from '../songs/service.js';
import { listTagsQuerySchema } from './schemas.js';
import * as tags from './service.js';

type TagsOptions = { db: Db };

// Same 400 shape as the other modules.
function invalidInput(reply: FastifyReply, error: ZodError) {
  return reply.code(400).send({
    message: 'Invalid input',
    issues: error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  });
}

export const tagsRoutes: FastifyPluginAsync<TagsOptions> = async (
  app,
  { db },
) => {
  // The group's tag vocabulary — autocomplete source for the song form and
  // the library filter picker. ?search= narrows it server-side (ilike, cap 20).
  app.get<{ Querystring: { search?: string } }>(
    '/api/tags',
    { preHandler: authorize(db, 'reader') },
    async (request, reply) => {
      let query: z.infer<typeof listTagsQuerySchema>;
      try {
        query = listTagsQuerySchema.parse(request.query);
      } catch (error) {
        return invalidInput(reply, error as ZodError);
      }

      const groupId = await getSingleGroupId(db);
      return { tags: await tags.listTags(db, groupId, query.search) };
    },
  );

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
