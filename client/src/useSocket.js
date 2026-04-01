import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

export function useSocket() {
  const socketRef = useRef(null);

  useEffect(() => {
    socketRef.current = io(window.location.origin, {
      transports: ['websocket', 'polling']
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  return socketRef;
}
