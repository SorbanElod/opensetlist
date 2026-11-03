import type { Server as HttpServer } from 'node:http';
import { eq } from 'drizzle-orm';
import { Server } from 'socket.io';

import { SESSION_COOKIE, getUserBySessionToken } from './auth/service.js';
import type { Db } from './db/index.js';
import { groupMembers } from './db/schema.js';
import { getSingleGroupId } from './songs/service.js';

// Live updates (issue #13): Socket.IO inside the monolith, per-group rooms,
// notify-only events. Clients refetch on `setlist:changed` — no diff/OT sync.
export const SETLIST_CHANGED_EVENT = 'setlist:changed';

export const groupRoom = (groupId: string) => `group:${groupId}`;

// Singleton, attached once from index.ts after listen. When it is not
// attached (unit tests using inject()), emitSetlistChanged is a no-op.
let io: Server | null = null;

function parseCookie(header: string, name: string): string | null {
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

// Attach Socket.IO to the Fastify HTTP server. The handshake is
// auth-checked with the same session cookie the HTTP API uses — the
// authorize() choke point stays HTTP-only; this middleware mirrors its
// steps 1 (valid session) and 3 (membership in the MVP-single group).
// Superadmins join the single group's room too (they support the group).
export function attachRealtime(server: HttpServer, db: Db): Server {
  io = new Server(server);

  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie ?? '';
      const token = parseCookie(cookieHeader, SESSION_COOKIE);
      const user = token ? await getUserBySessionToken(db, token) : null;
      if (!user) return next(new Error('unauthorized'));

      if (user.isSuperadmin) {
        socket.data.groupId = await getSingleGroupId(db);
      } else {
        const [membership] = await db
          .select()
          .from(groupMembers)
          .where(eq(groupMembers.userId, user.id));
        if (!membership) return next(new Error('forbidden'));
        socket.data.groupId = membership.groupId;
      }
      next();
    } catch (err) {
      next(err as Error);
    }
  });

  io.on('connection', (socket) => {
    const groupId = socket.data.groupId as string | undefined;
    if (groupId) socket.join(groupRoom(groupId));
  });

  return io;
}

// Notify-only nudge: payload carries the setlist id when known, null for
// library-wide changes. Clients refetch whatever they are showing.
export function emitSetlistChanged(groupId: string, setlistId?: string) {
  io?.to(groupRoom(groupId)).emit(SETLIST_CHANGED_EVENT, {
    setlistId: setlistId ?? null,
  });
}
