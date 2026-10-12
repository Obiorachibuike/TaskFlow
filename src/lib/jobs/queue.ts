/**
 * Background jobs.
 *
 * Production deployments with Redis can swap in BullMQ (documented in README);
 * the default is a durable-enough in-process scheduler suitable for single-node
 * deployments. Job handlers must be idempotent.
 */
import { logger } from "@/lib/logger";

export interface ScheduledJob {
  name: string;
  intervalMs: number;
  handler: () => Promise<void>;
}

class InProcessScheduler {
  private timers = new Map<string, NodeJS.Timeout>();
  private running = new Set<string>();

  register(job: ScheduledJob): void {
    if (this.timers.has(job.name)) return;
    const tick = async () => {
      if (this.running.has(job.name)) return;
      this.running.add(job.name);
      try {
        await job.handler();
      } catch (err) {
        logger.warn("jobs.handler_failed", { job: job.name, err: String(err) });
      } finally {
        this.running.delete(job.name);
      }
    };
    const timer = setInterval(tick, job.intervalMs);
    timer.unref?.();
    this.timers.set(job.name, timer);
    // run once shortly after boot
    setTimeout(tick, 5000).unref?.();
    logger.info("jobs.registered", { job: job.name, intervalMs: job.intervalMs });
  }

  stopAll(): void {
    for (const t of this.timers.values()) clearInterval(t);
    this.timers.clear();
  }
}

export const scheduler = new InProcessScheduler();

/** Enqueue work that should run after the current request settles. */
export function enqueueAfterResponse(name: string, handler: () => Promise<void>): void {
  setImmediate(() => {
    handler().catch((err) => logger.warn("jobs.after_response_failed", { job: name, err: String(err) }));
  });
}
