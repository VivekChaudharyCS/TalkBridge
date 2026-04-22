/**
 * lib/socket.ts
 *
 * Creates a single Socket.io client instance shared by the whole app.
 * Both UserPanel components import this so they share ONE socket connection
 * to the backend — the backend then broadcasts to all connected clients
 * and each panel filters messages by receiverId.
 */

import { io, Socket } from "socket.io-client";

const BACKEND_URL = "http://localhost:4000";

// Module-level singleton — created once, reused everywhere
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(BACKEND_URL, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on("connect", () => {
      console.log("[Socket] Connected to backend:", socket?.id);
    });

    socket.on("disconnect", (reason) => {
      console.warn("[Socket] Disconnected:", reason);
    });

    socket.on("connect_error", (err) => {
      console.error("[Socket] Connection error:", err.message);
    });
  }
  return socket;
}
