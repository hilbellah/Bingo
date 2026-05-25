export function registerSocketHandlers(io, { logger, authenticateAdminToken }) {
  io.on('connection', (socket) => {
    logger.debug('Socket client connected', { socketId: socket.id });

    socket.on('join:session', (sessionId) => {
      socket.join(`session:${sessionId}`);
    });

    socket.on('leave:session', (sessionId) => {
      socket.leave(`session:${sessionId}`);
    });

    socket.on('join:admin-receipts', async (payload = {}, ack) => {
      try {
        const adminToken = typeof payload?.token === 'string'
          ? payload.token
          : socket.handshake.auth?.adminToken;
        const adminUser = await authenticateAdminToken(adminToken);
        if (!adminUser) {
          socket.emit('admin:receipts:unauthorized');
          if (typeof ack === 'function') ack({ ok: false, error: 'Unauthorized' });
          return;
        }

        socket.data.adminUser = adminUser;
        socket.join('admin:receipts');
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        logger.error('join:admin-receipts handler error', { error: err?.message });
        if (typeof ack === 'function') ack({ ok: false, error: 'Internal error' });
      }
    });

    socket.on('leave:admin-receipts', () => {
      socket.leave('admin:receipts');
    });

    socket.on('disconnect', () => {
      logger.debug('Socket client disconnected', { socketId: socket.id });
    });
  });
}
