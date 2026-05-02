/**
 * Per-IP concurrent-request limit for AI analysis routes.
 * Limits each IP to MAX_CONCURRENT simultaneous in-flight requests
 * and enforces a hard 5-minute absolute timeout per request.
 */

import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

const activeRequests = new Map<string, number>();
const MAX_CONCURRENT = 3;
const TIMEOUT_MS = 5 * 60 * 1000;

export function concurrentRequestLimit(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const current = activeRequests.get(ip) ?? 0;

  if (current >= MAX_CONCURRENT) {
    res.status(429).json({
      error:
        "You have too many active analysis requests. Please wait for one to finish before starting another.",
    });
    return;
  }

  activeRequests.set(ip, current + 1);
  logger.debug({ ip, active: current + 1 }, "concurrentLimit: incremented");

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    const n = activeRequests.get(ip) ?? 0;
    if (n <= 1) activeRequests.delete(ip);
    else activeRequests.set(ip, n - 1);
    logger.debug({ ip, active: Math.max(0, n - 1) }, "concurrentLimit: decremented");
  };

  const timer = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ error: "Request timed out. Please try again." });
    }
    cleanup();
  }, TIMEOUT_MS);
  timer.unref();

  res.on("finish", () => { clearTimeout(timer); cleanup(); });
  res.on("close", () => { clearTimeout(timer); cleanup(); });

  next();
}
