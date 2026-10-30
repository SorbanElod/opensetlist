import type { FastifyPluginAsync } from 'fastify';
import type { ZodError } from 'zod';
import { z } from 'zod';

import { authorize } from '../auth/authorize.js';
import type { Db } from '../db/index.js';
import { changeRoleSchema } from './schemas.js';
import * as members from './service.js';

type MembersOptions = { db: Db };

export const membersRoutes: FastifyPluginAsync<MembersOptions> = async (
  app,
  { db },
) => {
  // Read endpoints are visible to all group members — readers included.
  app.get('/api/members', { preHandler: authorize(db, 'reader') }, async () => {
    const groupId = await members.getSingleGroupId(db);

    return { members: await members.listMembers(db, groupId) };
  });

  app.patch<{ Params: { id: string } }>(
    '/api/members/:id',
    { preHandler: authorize(db, 'group_manager') },
    async (request, reply) => {
      let body: z.infer<typeof changeRoleSchema>;
      try {
        body = changeRoleSchema.parse(request.body);
      } catch (error) {
        return reply.code(400).send({
          message: 'Invalid input',
          issues: (error as ZodError).issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }

      const groupId = await members.getSingleGroupId(db);
      const result = await members.changeMemberRole(db, {
        groupId,
        memberId: request.params.id,
        role: body.role,
      });

      if (!result.ok) {
        // 409: the request is valid but conflicts with database state.
        return reply
          .code(result.reason === 'last_manager' ? 409 : 404)
          .send({ message: failureMessage(result.reason) });
      }

      return { member: result.member };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/members/:id',
    { preHandler: authorize(db, 'group_manager') },
    async (request, reply) => {
      const groupId = await members.getSingleGroupId(db);
      const result = await members.removeMember(db, {
        groupId,
        memberId: request.params.id,
      });

      if (!result.ok) {
        return reply
          .code(result.reason === 'last_manager' ? 409 : 404)
          .send({ message: failureMessage(result.reason) });
      }

      return { member: result.member };
    },
  );
};

function failureMessage(reason: 'not_found' | 'last_manager'): string {
  if (reason === 'last_manager') {
    return 'Cannot remove the last group_manager of the group';
  }
  return 'Member not found';
}
