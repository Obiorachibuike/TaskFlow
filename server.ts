/**
 * TaskFlow custom server: Next.js + Socket.IO + background job scheduler.
 *
 * Why a custom server: Socket.IO needs a persistent WebSocket server attached to
 * the same HTTP listener. Deployments that cannot run a long-lived Node server
 * (e.g. serverless) should host the realtime layer separately — see README
 * "Real-time architecture".
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loadEnvFile } from "node:process";
import next from "next";
import { Server as SocketIOServer, type Socket } from "socket.io";
import { decode } from "next-auth/jwt";

try {
  loadEnvFile(".env");
} catch {
  /* optional */
}

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const socketPath = process.env.SOCKET_PATH || "/socket.io";

async function main() {
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    handle(req, res);
  });

  const io = new SocketIOServer(httpServer, {
    path: socketPath,
    cors: { origin: true, credentials: true },
    serveClient: false,
  });

  /** Authenticate every socket with the Auth.js session cookie. */
  io.use(async (socket: Socket, nextFn) => {
    try {
      const cookies = parseCookies(socket.handshake.headers.cookie ?? "");
      const raw =
        cookies["authjs.session-token"] ??
        cookies["__Secure-authjs.session-token"] ??
        cookies["next-auth.session-token"] ??
        null;
      if (!raw || !process.env.AUTH_SECRET) {
        return nextFn(new Error("unauthorized"));
      }
      const token = await decode({
        token: raw,
        salt: cookies["__Secure-authjs.session-token"] ? "__Secure-authjs.session-token" : "authjs.session-token",
        secret: process.env.AUTH_SECRET,
      });
      const userId = (token as { id?: string; sub?: string } | null)?.id ?? (token as { sub?: string } | null)?.sub;
      if (!userId) return nextFn(new Error("unauthorized"));
      socket.data.userId = userId as string;
      nextFn();
    } catch {
      nextFn(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const userId = socket.data.userId as string;
    void socket.join(`user:${userId}`);

    socket.on("join_workspace", async (payload: { workspaceId?: string }) => {
      const workspaceId = payload?.workspaceId;
      if (!workspaceId || typeof workspaceId !== "string") return;
      // Verify membership before joining the room — never broadcast private
      // workspace data to unauthorized sockets.
      try {
        const { prisma } = await import("./src/lib/prisma");
        const membership = await prisma.workspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId, userId } },
          select: { id: true },
        });
        if (membership) {
          await socket.join(`workspace:${workspaceId}`);
          socket.emit("joined", { workspaceId });
        } else {
          socket.emit("error", { message: "not a member" });
        }
      } catch {
        socket.emit("error", { message: "join failed" });
      }
    });

    socket.on("leave_workspace", async (payload: { workspaceId?: string }) => {
      if (payload?.workspaceId) await socket.leave(`workspace:${payload.workspaceId}`);
    });

    socket.on("disconnect", () => {
      /* rooms are cleaned up automatically */
    });
  });

  // Bridge the in-process realtime bus to sockets
  const { realtimeBus } = await import("./src/lib/realtime/bus");
  realtimeBus.subscribe(({ target, event }) => {
    if (target.userId) {
      io.to(`user:${target.userId}`).emit("event", event);
    } else {
      io.to(`workspace:${target.workspaceId}`).emit("event", event);
    }
  });

  // Background jobs (due-date reminders, …). In production with Redis, swap in
  // BullMQ workers — see README.
  const schedulerInterval = Number(process.env.JOB_SCHEDULER_INTERVAL_MS ?? 60000);
  if (schedulerInterval > 0) {
    const { scheduler } = await import("./src/lib/jobs/queue");
    const { runDueDateReminders } = await import("./src/lib/services/notifications");
    scheduler.register({
      name: "due-date-reminders",
      intervalMs: schedulerInterval,
      handler: async () => {
        await runDueDateReminders();
      },
    });
  }

  httpServer.listen(port, hostname, () => {
    console.log(`[taskflow] ready on http://${hostname}:${port} (socket path ${socketPath})`);
  });

  const shutdown = () => {
    io.close();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function parseCookies(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx > 0) {
      out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return out;
}

main().catch((err) => {
  console.error("[taskflow] server failed to start", err);
  process.exit(1);
});
