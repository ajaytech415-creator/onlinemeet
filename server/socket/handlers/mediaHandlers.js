export default function registerMediaHandlers(io, socket, { rooms }) {
  // Broadcast media state changes (mic/camera) to all peers in the room
  socket.on('media-state', ({ roomId, audio, video }) => {
    socket.to(roomId).emit('peer-media-state', { socketId: socket.id, audio, video });
  });

  // Raised hand — notify staff (host) only
  socket.on('raise-hand', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room) {
      io.to(room.hostSocketId).emit('hand-raised', {
        socketId: socket.id,
        name: socket.data.user.name,
      });
    }
  });

  // Screen share state — broadcast to all peers in room
  socket.on('screen-share-start', ({ roomId }) => {
    socket.to(roomId).emit('screen-share-started', { socketId: socket.id });
  });

  socket.on('screen-share-stop', ({ roomId }) => {
    socket.to(roomId).emit('screen-share-stopped', { socketId: socket.id });
  });
}
