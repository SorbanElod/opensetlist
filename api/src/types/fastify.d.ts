import type { FastifyRequest } from 'fastify';

import type { PublicUser } from '../auth/service.js';

// Module augmentation: Fastify's request object is typed by the library;
// this is the official extension point for adding request properties.
// authorize() sets request.user after authentication; every handler behind
// the choke point can rely on it.
declare module 'fastify' {
  interface FastifyRequest {
    user?: PublicUser;
  }
}

// Keep the augmentation honest: authorize guarantees user only after it ran.
export type AuthenticatedRequest = FastifyRequest & { user: PublicUser };
