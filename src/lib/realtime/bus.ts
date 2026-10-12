/**
 * In-process realtime event bus. The Socket.IO server (server.ts) subscribes and
 * broadcasts to authenticated workspace/project rooms. Services publish here so
 * they never depend on Socket.IO directly.
 *
 * Multi-node deployments: replace the EventEmitter with a Redis-backed bus
 * (see README "Real-time architecture").
 */
import { EventEmitter } from "node:events";

export type RealtimeEvent =
  | { type: "issue.created"; payload: { issueId: string; projectId: string; key: string } }
  | { type: "issue.updated"; payload: { issueId: string; projectId: string; key: string; fields: string[] } }
  | { type: "issue.moved"; payload: { issueId: string; projectId: string; key: string; status: string } }
  | { type: "issue.deleted"; payload: { issueId: string; projectId: string; key: string } }
  | { type: "issue.bulk_updated"; payload: { projectId: string; issueIds: string[] } }
  | { type: "comment.created"; payload: { issueId: string; projectId: string; commentId: string } }
  | { type: "comment.updated"; payload: { issueId: string; commentId: string } }
  | { type: "comment.deleted"; payload: { issueId: string; commentId: string } }
  | { type: "sprint.updated"; payload: { sprintId: string; projectId: string; status: string } }
  | { type: "notification.created"; payload: { notificationId: string; userId: string } }
  | { type: "board.updated"; payload: { projectId: string } }
  | { type: "project.updated"; payload: { projectId: string } }
  | { type: "presence"; payload: { userId: string; name: string; online: boolean } };

export interface RealtimeTarget {
  workspaceId: string;
  projectId?: string;
  userId?: string;
}

const globalBus = globalThis as unknown as { __taskflowBus?: EventEmitter };

class RealtimeBus {
  private emitter: EventEmitter;

  constructor() {
    this.emitter = globalBus.__taskflowBus ?? new EventEmitter();
    this.emitter.setMaxListeners(100);
    globalBus.__taskflowBus = this.emitter;
  }

  publish(target: RealtimeTarget, event: RealtimeEvent): void {
    this.emitter.emit("event", { target, event, at: Date.now() });
  }

  subscribe(
    handler: (msg: { target: RealtimeTarget; event: RealtimeEvent; at: number }) => void,
  ): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}

export const realtimeBus = new RealtimeBus();
