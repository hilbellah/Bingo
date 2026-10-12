import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

// One Socket.IO connection for the customer booking page. The socket object is
// created once (not yet connected) so every render, including the first, can
// hand the same instance to child components; it connects when the page mounts
// and disconnects when it unmounts.
export function useSocket() {
  const [socket] = useState(() => io(window.location.origin, {
    transports: ['websocket', 'polling'],
    autoConnect: false,
  }));

  useEffect(() => {
    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, [socket]);

  return socket;
}
