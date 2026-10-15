"use client";

/**
 * Subscribes to authenticated Socket.IO events for the current workspace and
 * refreshes server-rendered data when something changes. Connection is
 * cookie-authenticated; the server verifies workspace membership before
 * broadcasting (see server.ts).
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { logger } from "@/lib/logger";

interface RealtimeEventMsg {
  type: string;
  payload: Record<string, unknown>;
}

export function RealtimeProvider({
  workspaceSlug,
  workspaceId,
  children,
}: {
  workspaceSlug: string;
  workspaceId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { toast } = useToast();

  React.useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;

    async function connect() {
      try {
        const { io } = await import("socket.io-client");
        const socket = io({
          path: "/socket.io",
          withCredentials: true,
          transports: ["websocket", "polling"],
          reconnectionAttempts: 8,
        });

        socket.on("connect", () => {
          socket.emit("join_workspace", { workspaceId });
        });

        socket.on("event", (msg: RealtimeEventMsg) => {
          if (disposed) return;
          switch (msg.type) {
            case "issue.created":
            case "issue.updated":
            case "issue.moved":
            case "issue.deleted":
            case "issue.bulk_updated":
            case "comment.created":
            case "comment.updated":
            case "comment.deleted":
            case "sprint.updated":
            case "board.updated":
            case "project.updated":
              router.refresh();
              break;
            case "notification.created": {
              toast({ variant: "info", title: String((msg.payload as { title?: string }).title ?? "New notification") });
              router.refresh();
              break;
            }
            default:
              break;
          }
        });

        cleanup = () => {
          socket.emit("leave_workspace", { workspaceId });
          socket.disconnect();
        };
      } catch (err) {
        logger.warn("realtime.connect_failed", { err: String(err) });
      }
    }

    void connect();
    return () => {
      disposed = true;
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, workspaceId]);

  return <>{children}</>;
}

function noop(..._args: unknown[]) {}
const loggerShim = { warn: noop };
void loggerShim;
