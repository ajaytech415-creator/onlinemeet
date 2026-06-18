import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

let socket = null;

export function getSocket() {
  return socket;
}

export function connectSocket({ token, guestName } = {}) {
  if (socket && socket.connected) return socket;

  const auth = {};
  if (token) auth.token = token;
  if (guestName) auth.guestName = guestName;

  socket = io(SOCKET_URL, {
    auth,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export default { getSocket, connectSocket, disconnectSocket };
