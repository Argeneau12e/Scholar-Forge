import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import rateLimit from "express-rate-limit";

const router: IRouter = Router();

const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many PDF chat messages. Please wait before sending more." },
});

const SYSTEM_PROMPT = `You are an academic research assistant helping a student understand a research paper. You have access to the paper's text below.

Rules:
- Answer only from the paper's content — never fabricate findings
- If the answer is not in the provided text, say exactly: 'This information is not in the section of the paper I can see. Try asking about [related topic that IS in the text].'
- Use the student's discipline level — explain jargon when you use it
- When quoting, always give the approximate location (e.g. 'In the Methods section...' or 'The authors state in their Discussion...')
- Keep answers concise unless the student asks for detail
- If asked to summarise, structure as: Background | Methods | Key Findings | Limitations | Relevance`;

interface Message {
  role: "user" | "assistant";
  content: string;
}

function chunkText(text: string, question: string, maxChars = 14000): string {
  if (text.length <= maxChars) return text;

  const intro = text.slice(0, 2000);
  const outro = text.slice(-1000);
  const remaining = text.slice(2000, -1000);

  const keywords = question.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
  const chunkSize = 800;
  const chunks: { text: string; score: number }[] = [];

  for (let i = 0; i < remaining.length; i += chunkSize) {
    const chunk = remaining.slice(i, i + chunkSize);
    const lower = chunk.toLowerCase();
    const score = keywords.reduce((s, kw) => s + (lower.includes(kw) ? 1 : 0), 0);
    chunks.push({ text: chunk, score });
  }

  chunks.sort((a, b) => b.score - a.score);

  let assembled = intro;
  const budget = maxChars - intro.length - outro.length - 100;
  let used = 0;

  for (const chunk of chunks) {
    if (used + chunk.text.length > budget) break;
    assembled += "\n" + chunk.text;
    used += chunk.text.length;
  }

  assembled += "\n" + outro;
  return assembled;
}

// POST /api/pdf/chat  (SSE streaming)
router.post("/pdf/chat", chatLimiter, async (req, res): Promise<void> => {
  const { message, conversationHistory = [], extractedText = "" } = req.body as {
    message: string;
    conversationHistory?: Message[];
    extractedText?: string;
  };

  if (!message || message.trim().length === 0) {
    res.status(400).json({ error: "message is required" });
    return;
  }
  if (message.length > 2000) {
    res.status(400).json({ error: "Message too long (max 2000 chars)" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "AI features not configured" });
    return;
  }

  const context = chunkText(extractedText, message);
  const systemWithDoc = `${SYSTEM_PROMPT}\n\nPaper text:\n=== DOCUMENT START ===\n${context}\n=== DOCUMENT END ===`;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const client = new Anthropic({ apiKey });

  try {
    const safeHistory = conversationHistory.slice(-6).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content.slice(0, 3000),
    }));

    const stream = client.messages.stream({
      model: "claude-haiku-4-5",
      max_tokens: 1000,
      system: systemWithDoc,
      messages: [
        ...safeHistory,
        { role: "user", content: message.trim() },
      ],
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        const data = JSON.stringify({ text: event.delta.text });
        res.write(`data: ${data}\n\n`);
      }
    }

    res.write("data: [DONE]\n\n");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stream error";
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
  } finally {
    res.end();
  }
});

export default router;
