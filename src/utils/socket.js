let io;

const setIO = (ioInstance) => {
  io = ioInstance;
};

const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};

export { setIO, getIO };
