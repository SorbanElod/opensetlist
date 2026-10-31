import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import type { ZodError } from 'zod';
import { z } from 'zod';

import { authorize } from '../auth/authorize.js';
import type { Db } from '../db/index.js';
import {
  createSongSchema,
  deleteSongSchema,
  importSongsSchema,
  updateSongSchema,
} from './schemas.js';
import * as songs from './service.js';

type SongsOptions = { db: Db };

// Same 400 shape as the auth routes: field-level issues are fine to reveal,
// they are validation feedback for the client.
function invalidInput(reply: FastifyReply, error: ZodError) {
  return reply.code(400).send({
    message: 'Invalid input',
    issues: error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  });
}

export const songsRoutes: FastifyPluginAsync<SongsOptions> = async (
  app,
  { db },
) => {
  // Readers see the whole group library (MVP: no per-song guest scoping).
  app.get('/api/songs', { preHandler: authorize(db, 'reader') }, async () => {
    const groupId = await songs.getSingleGroupId(db);

    return { songs: await songs.listSongs(db, groupId) };
  });

  app.post(
    '/api/songs',
    { preHandler: authorize(db, 'member') },
    async (request, reply) => {
      let body: z.infer<typeof createSongSchema>;
      try {
        body = createSongSchema.parse(request.body);
      } catch (error) {
        return invalidInput(reply, error as ZodError);
      }

      const groupId = await songs.getSingleGroupId(db);
      // authorize() already authenticated the request; the owner is the caller.
      const song = await songs.createSong(db, {
        groupId,
        ownerId: request.user!.id,
        song: body,
      });

      return reply.code(201).send({ song });
    },
  );

  // JSON seed import (dev tooling; see api/fixtures/dev-seed.json).
  // Static path, so it wins over /api/songs/:id in the router.
  app.post(
    '/api/songs/import',
    { preHandler: authorize(db, 'member') },
    async (request, reply) => {
      let body: z.infer<typeof importSongsSchema>;
      try {
        body = importSongsSchema.parse(request.body);
      } catch (error) {
        return invalidInput(reply, error as ZodError);
      }

      const groupId = await songs.getSingleGroupId(db);
      const result = await songs.importSongs(db, {
        groupId,
        ownerId: request.user!.id,
        data: body,
      });

      return reply.code(201).send({
        imported: result.songs.length,
        arrangementsImported: result.arrangementsImported,
        skippedTags: result.skippedTags,
        songs: result.songs,
      });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/songs/:id',
    { preHandler: authorize(db, 'reader') },
    async (request, reply) => {
      const groupId = await songs.getSingleGroupId(db);
      const song = await songs.getSong(db, groupId, request.params.id);

      if (!song) {
        return reply.code(404).send({ message: 'Song not found' });
      }

      return { song };
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/api/songs/:id',
    { preHandler: authorize(db, 'member') },
    async (request, reply) => {
      let body: z.infer<typeof updateSongSchema>;
      try {
        body = updateSongSchema.parse(request.body);
      } catch (error) {
        return invalidInput(reply, error as ZodError);
      }

      const groupId = await songs.getSingleGroupId(db);
      const result = await songs.updateSong(db, {
        groupId,
        id: request.params.id,
        song: body,
      });

      if (!result.ok) {
        return reply.code(result.reason === 'conflict' ? 409 : 404).send({
          message:
            result.reason === 'conflict'
              ? 'Song was modified by someone else — reload and try again'
              : 'Song not found',
        });
      }

      return { song: result.song };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/songs/:id',
    { preHandler: authorize(db, 'member') },
    async (request, reply) => {
      let body: z.infer<typeof deleteSongSchema>;
      try {
        body = deleteSongSchema.parse(request.body);
      } catch (error) {
        return invalidInput(reply, error as ZodError);
      }

      const groupId = await songs.getSingleGroupId(db);
      const result = await songs.deleteSong(db, {
        groupId,
        id: request.params.id,
        version: body.version,
      });

      if (!result.ok) {
        return reply.code(result.reason === 'conflict' ? 409 : 404).send({
          message:
            result.reason === 'conflict'
              ? 'Song was modified by someone else — reload and try again'
              : 'Song not found',
        });
      }

      return { status: 'ok' };
    },
  );
};
