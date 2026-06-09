import type { IncomingMessage, ServerResponse } from "node:http";
import app from "../artifacts/api-server/src/app";

export default function handler(
  req: IncomingMessage,
  res: ServerResponse
): void {
  app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1]);
}
