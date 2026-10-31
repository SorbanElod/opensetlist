import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import type { ZodError } from 'zod';
import { z } from 'zod';

import { authorize } from '../auth/authorize.js';
import type { Db } from '../db/index.js';
import { getSingleGroupId } from '../songs/service.js';
import {
  createArrangementSchema,
  deleteArrangementSchema,
  updateArrangementSchema,
} from './schemas.js';
import * as arrangements from './service.js';

type ArrangementsOptions = { db: Db };

// Same 400 shape as the songs routes: field-level issues are fine to reveal,
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

export const arrangementsRoutes: FastifyPluginAsync<
  ArrangementsOptions
> = async (app, { db }) => {
  // List/create nest under the song; single reads/updates/deletes go by id.
  // Readers see arrangements (role-based rendering in #10 reads them);
  // only members+ create, update, delete.
  app.get<{ Params: { songId: string } }>(
    '/api/songs/:songId/arrangements',
    { preHandler: authorize(db, 'reader') },
    async (request, reply) => {
      const groupId = await getSingleGroupId(db);
      const list = await arrangements.listArrangements(
        db,
        groupId,
        request.params.songId,
      );

      if (!list) {
        return reply.code(404).send({ message: 'Song not found' });
      }

      return { arrangements: list };
    },
  );

  app.post<{ Params: { songId: string } }>(
    '/api/songs/:songId/arrangements',
    { preHandler: authorize(db, 'member') },
    async (request, reply) => {
      let body: z.infer<typeof createArrangementSchema>;
      try {
        body = createArrangementSchema.parse(request.body);
      } catch (error) {
        return invalidInput(reply, error as ZodError);
      }

      const groupId = await getSingleGroupId(db);
      const arrangement = await arrangements.createArrangement(db, {
        groupId,
        songId: request.params.songId,
        arrangement: body,
      });

      if (!arrangement) {
        return reply.code(404).send({ message: 'Song not found' });
      }

      return reply.code(201).send({ arrangement });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/arrangements/:id',
    { preHandler: authorize(db, 'reader') },
    async (request, reply) => {
      const groupId = await getSingleGroupId(db);
      const arrangement = await arrangements.getArrangement(
        db,
        groupId,
        request.params.id,
      );

      if (!arrangement) {
        return reply.code(404).send({ message: 'Arrangement not found' });
      }

      return { arrangement };
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/api/arrangements/:id',
    { preHandler: authorize(db, 'member') },
    async (request, reply) => {
      let body: z.infer<typeof updateArrangementSchema>;
      try {
        body = updateArrangementSchema.parse(request.body);
      } catch (error) {
        return invalidInput(reply, error as ZodError);
      }

      const groupId = await getSingleGroupId(db);
      const result = await arrangements.updateArrangement(db, {
        groupId,
        id: request.params.id,
        arrangement: body,
      });

      if (!result.ok) {
        return reply.code(result.reason === 'conflict' ? 409 : 404).send({
          message:
            result.reason === 'conflict'
              ? 'Arrangement was modified by someone else — reload and try again'
              : 'Arrangement not found',
        });
      }

      return { arrangement: result.arrangement };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/arrangements/:id',
    { preHandler: authorize(db, 'member') },
    async (request, reply) => {
      let body: z.infer<typeof deleteArrangementSchema>;
      try {
        body = deleteArrangementSchema.parse(request.body);
      } catch (error) {
        return invalidInput(reply, error as ZodError);
      }

      const groupId = await getSingleGroupId(db);
      const result = await arrangements.deleteArrangement(db, {
        groupId,
        id: request.params.id,
        version: body.version,
      });

      if (!result.ok) {
        return reply.code(result.reason === 'conflict' ? 409 : 404).send({
          message:
            result.reason === 'conflict'
              ? 'Arrangement was modified by someone else — reload and try again'
              : 'Arrangement not found',
        });
      }

      return { status: 'ok' };
    },
  );
};
