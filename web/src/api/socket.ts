import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

// Same-origin singleton: the httpOnly session cookie rides along on the
// handshake automatically (dev: via the Vite proxy, prod: same origin).
// The server auth-checks the handshake and puts the socket in the group
// room (api/src/realtime.ts).
export function getSocket(): Socket {
  if (!socket) socket = io();
  return socket;
}
