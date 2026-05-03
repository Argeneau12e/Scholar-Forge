import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";
import { concurrentRequestLimit } from "./middlewares/requestLimit";

const app: Express = express();

// Trust the reverse proxy (Replit's shared proxy sets X-Forwarded-For)
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// ── CORS ─────────────────────────────────────────────────────────────────────
// In production, restrict to the Replit-assigned domain.
// In development, allow all origins (localhost + Replit preview proxy).
const allowedOrigins: string[] = process.env.REPLIT_DOMAINS
  ? process.env.REPLIT_DOMAINS.split(",").map((d) => `https://${d.trim()}`)
  : [];

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no Origin header (e.g. curl, server-to-server)
      if (!origin) return cb(null, true);
      // Dev: allow everything
      if (process.env.NODE_ENV !== "production") return cb(null, true);
      // Prod: only allow listed domains
      if (allowedOrigins.some((o) => origin.startsWith(o))) return cb(null, true);
      return cb(new Error(`CORS: origin "${origin}" not permitted`));
    },
    credentials: true,
  })
);

// ── Security headers ──────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'"],
        styleSrc:   ["'self'", "'unsafe-inline'"],
        imgSrc:     ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc:    ["'self'"],
        objectSrc:  ["'none'"],
        mediaSrc:   ["'none'"],
        frameSrc:   ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// ── Body parsers with size limits ─────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ── Global rate limiters ──────────────────────────────────────────────────────

// Wide /api/* — 200 req / 15 min per IP (prevents DDoS on non-AI endpoints)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait and try again." },
});

// Claude-backed routes — 60 req / hour per IP shared across all AI endpoints
// Individual routes add stricter per-endpoint limits as a second layer.
const claudeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "AI request limit reached. Please wait before making more AI requests." },
});

const CLAUDE_ROUTES = [
  "/api/paraphrase",
  "/api/gaps",
  "/api/litreview",
  "/api/coach",
  "/api/argmap",
  "/api/plagiarism",
  "/api/similarity",
  "/api/question",
  "/api/citecontext",
  "/api/outline/analyze",
  "/api/outline/resources",
  "/api/methodology",
  "/api/schedule",
  "/api/poster/content",
  "/api/abstract",
  "/api/pdf/chat",
  "/api/concept",
  "/api/language",
  "/api/visuals",
  "/api/journals",
  "/api/digest",
  "/api/workspace/analyze",
];

for (const p of ["/api/paraphrase", "/api/gaps", "/api/litreview", "/api/coach", "/api/argmap", "/api/plagiarism"]) {
  app.use(p, concurrentRequestLimit);
}
for (const p of CLAUDE_ROUTES) {
  app.use(p, claudeLimiter);
}
app.use("/api", apiLimiter);
app.use("/api", router);

export default app;
