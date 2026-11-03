import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import type { ZodError } from 'zod';
import { z } from 'zod';

import { authorize } from '../auth/authorize.js';
import type { Db } from '../db/index.js';
import { getSingleGroupId } from '../songs/service.js';
import {
  createItemSchema,
  createSetlistSchema,
  deleteItemSchema,
  deleteSetlistSchema,
  moveItemSchema,
  updateItemSchema,
  updateSetlistSchema,
} from './schemas.js';
import * as setlists from './service.js';

type SetlistsOptions = { db: Db };

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

function itemError(
  reply: FastifyReply,
  result:
    | { ok: false; reason: string; message?: string }
    | { ok: true },
) {
  if (result.ok) return null;
  if (result.reason === 'not_found') {
    return reply.code(404).send({ message: 'Not found' });
  }
  if (result.reason === 'conflict') {
    return reply.code(409).send({
      message: 'Setlist was modified by someone else — reload and try again',
    });
  }
  return reply.code(400).send({
    message: result.message ?? 'Invalid item',
  });
}

export const setlistsRoutes: FastifyPluginAsync<SetlistsOptions> = async (
  app,
  { db },
) => {
  // Readers see the group's setlists (like the song library); only members+
  // mutate them.
  app.get('/api/setlists', { preHandler: authorize(db, 'reader') }, async () => {
    const groupId = await getSingleGroupId(db);
    return { setlists: await setlists.listSetlists(db, groupId) };
  });

  app.post(
    '/api/setlists',
    { preHandler: authorize(db, 'member') },
    async (request, reply) => {
      let body: z.infer<typeof createSetlistSchema>;
      try {
        body = createSetlistSchema.parse(request.body);
      } catch (error) {
        return invalidInput(reply, error as ZodError);
      }

      const groupId = await getSingleGroupId(db);
      const setlist = await setlists.createSetlist(db, {
        groupId,
        setlist: body,
      });
      return reply.code(201).send({ setlist });
    },
  );

  // The detail read resolves every item to its arrangement + effective
  // sequence — the one place the "effective sequence" rule is applied.
  app.get<{ Params: { id: string } }>(
    '/api/setlists/:id',
    { preHandler: authorize(db, 'reader') },
    async (request, reply) => {
      const groupId = await getSingleGroupId(db);
      const result = await setlists.getSetlistWithItems(
        db,
        groupId,
        request.params.id,
      );
      if (!result) {
        return reply.code(404).send({ message: 'Setlist not found' });
      }
      return result;
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/api/setlists/:id',
    { preHandler: authorize(db, 'member') },
    async (request, reply) => {
      let body: z.infer<typeof updateSetlistSchema>;
      try {
        body = updateSetlistSchema.parse(request.body);
      } catch (error) {
        return invalidInput(reply, error as ZodError);
      }

      const groupId = await getSingleGroupId(db);
      const result = await setlists.updateSetlist(db, {
        groupId,
        id: request.params.id,
        setlist: body,
      });
      if (!result.ok) {
        return reply.code(result.reason === 'conflict' ? 409 : 404).send({
          message:
            result.reason === 'conflict'
              ? 'Setlist was modified by someone else — reload and try again'
              : 'Setlist not found',
        });
      }
      return { setlist: result.setlist };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/setlists/:id',
    { preHandler: authorize(db, 'member') },
    async (request, reply) => {
      let body: z.infer<typeof deleteSetlistSchema>;
      try {
        body = deleteSetlistSchema.parse(request.body);
      } catch (error) {
        return invalidInput(reply, error as ZodError);
      }

      const groupId = await getSingleGroupId(db);
      const result = await setlists.deleteSetlist(db, {
        groupId,
        id: request.params.id,
        version: body.version,
      });
      if (!result.ok) {
        return reply.code(result.reason === 'conflict' ? 409 : 404).send({
          message:
            result.reason === 'conflict'
              ? 'Setlist was modified by someone else — reload and try again'
              : 'Setlist not found',
        });
      }
      return { status: 'ok' };
    },
  );

  // --- Items ---------------------------------------------------------------

  app.post<{ Params: { id: string } }>(
    '/api/setlists/:id/items',
    { preHandler: authorize(db, 'member') },
    async (request, reply) => {
      let body: z.infer<typeof createItemSchema>;
      try {
        body = createItemSchema.parse(request.body);
      } catch (error) {
        return invalidInput(reply, error as ZodError);
      }

      const groupId = await getSingleGroupId(db);
      const result = await setlists.addItem(db, {
        groupId,
        setlistId: request.params.id,
        item: body,
      });
      const failure = itemError(reply, result);
      if (failure) return failure;
      if (result.ok) {
        return reply.code(201).send({
          item: result.item,
          setlistVersion: result.setlistVersion,
        });
      }
    },
  );

  app.patch<{ Params: { id: string; itemId: string } }>(
    '/api/setlists/:id/items/:itemId',
    { preHandler: authorize(db, 'member') },
    async (request, reply) => {
      let body: z.infer<typeof updateItemSchema>;
      try {
        body = updateItemSchema.parse(request.body);
      } catch (error) {
        return invalidInput(reply, error as ZodError);
      }

      const groupId = await getSingleGroupId(db);
      const result = await setlists.updateItem(db, {
        groupId,
        setlistId: request.params.id,
        itemId: request.params.itemId,
        item: body,
      });
      const failure = itemError(reply, result);
      if (failure) return failure;
      if (result.ok) {
        return {
          item: result.item,
          setlistVersion: result.setlistVersion,
        };
      }
    },
  );

  app.delete<{ Params: { id: string; itemId: string } }>(
    '/api/setlists/:id/items/:itemId',
    { preHandler: authorize(db, 'member') },
    async (request, reply) => {
      let body: z.infer<typeof deleteItemSchema>;
      try {
        body = deleteItemSchema.parse(request.body);
      } catch (error) {
        return invalidInput(reply, error as ZodError);
      }

      const groupId = await getSingleGroupId(db);
      const result = await setlists.deleteItem(db, {
        groupId,
        setlistId: request.params.id,
        itemId: request.params.itemId,
        version: body.version,
      });
      const failure = itemError(reply, result);
      if (failure) return failure;
      if (result.ok) {
        return { items: result.items, setlistVersion: result.setlistVersion };
      }
    },
  );

  // Reorder by swapping with the neighbor; returns the full resolved list so
  // the client can replace its state in one step.
  app.post<{ Params: { id: string; itemId: string } }>(
    '/api/setlists/:id/items/:itemId/move',
    { preHandler: authorize(db, 'member') },
    async (request, reply) => {
      let body: z.infer<typeof moveItemSchema>;
      try {
        body = moveItemSchema.parse(request.body);
      } catch (error) {
        return invalidInput(reply, error as ZodError);
      }

      const groupId = await getSingleGroupId(db);
      const result = await setlists.moveItem(db, {
        groupId,
        setlistId: request.params.id,
        itemId: request.params.itemId,
        direction: body.direction,
        version: body.version,
      });
      const failure = itemError(reply, result);
      if (failure) return failure;
      if (result.ok) {
        return { items: result.items, setlistVersion: result.setlistVersion };
      }
    },
  );
};
