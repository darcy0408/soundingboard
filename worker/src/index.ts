import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { handleTurn } from "./routes/turn";
import { handleFeedback } from "./routes/feedback";
import { handleTts } from "./routes/tts";
import { handleReport } from "./routes/report";

const app = new Hono<{ Bindings: Env }>();

app.use(
  "*",
  cors({
    origin: (origin, c) => c.env.ALLOWED_ORIGIN || "*",
    allowMethods: ["POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "x-device-id", "x-entitled"],
  })
);

app.get("/", (c) => c.json({ ok: true, service: "soundingboard-api" }));

app.post("/v1/turn", handleTurn);
app.post("/v1/feedback", handleFeedback);
app.post("/v1/tts", handleTts);
app.post("/v1/report", handleReport);

app.notFound((c) => c.json({ error: "not_found", message: "No such route." }, 404));

export default app;
