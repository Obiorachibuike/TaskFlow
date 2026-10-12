/**
 * AI provider abstraction. The concrete model provider is swappable without
 * touching application logic — implement AIProvider and register it here.
 *
 * Secrets stay on the server. When no credentials are configured, capabilities
 * report `configured: false` and the UI shows setup instructions instead of
 * pretending an AI response happened.
 */
import { logger } from "@/lib/logger";

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AICompletionRequest {
  system: string;
  messages: AIMessage[];
  maxTokens: number;
  timeoutMs: number;
  /** Ask for JSON output (validated by callers with Zod — never trusted raw). */
  json?: boolean;
}

export interface AICompletionResult {
  text: string;
  provider: string;
  model: string;
  tokensUsed?: number;
}

export class AIError extends Error {
  constructor(
    message: string,
    readonly kind: "not_configured" | "timeout" | "rate_limited" | "provider_error" | "invalid_output",
  ) {
    super(message);
    this.name = "AIError";
  }
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  isConfigured(): boolean;
  complete(req: AICompletionRequest): Promise<AICompletionResult>;
}

class OpenAICompatibleProvider implements AIProvider {
  readonly name = "openai";
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    readonly model: string,
  ) {}

  isConfigured() {
    return !!this.apiKey;
  }

  async complete(req: AICompletionRequest): Promise<AICompletionResult> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "system", content: req.system }, ...req.messages],
        max_tokens: req.maxTokens,
        temperature: 0.2,
        ...(req.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(req.timeoutMs),
    }).catch((err) => {
      if (String(err).includes("TimeoutError") || String(err).includes("timeout")) {
        throw new AIError("AI request timed out", "timeout");
      }
      throw new AIError(`AI provider unreachable: ${String(err).slice(0, 200)}`, "provider_error");
    });

    if (res.status === 429) throw new AIError("AI rate limit reached, try again later", "rate_limited");
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.warn("ai.openai.error", { status: res.status, body: body.slice(0, 300) });
      throw new AIError(`AI provider error (${res.status})`, "provider_error");
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    };
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== "string") {
      throw new AIError("AI provider returned an empty response", "invalid_output");
    }
    return {
      text,
      provider: this.name,
      model: this.model,
      tokensUsed: data.usage?.total_tokens,
    };
  }
}

class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  isConfigured() {
    return !!this.apiKey;
  }

  async complete(req: AICompletionRequest): Promise<AICompletionResult> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        system: req.system,
        messages: req.messages.map((m) => ({ role: m.role === "system" ? "user" : m.role, content: m.content })),
        max_tokens: req.maxTokens,
        ...(req.json
          ? {
              output_config: undefined,
            }
          : {}),
      }),
      signal: AbortSignal.timeout(req.timeoutMs),
    }).catch((err) => {
      if (String(err).includes("TimeoutError") || String(err).includes("timeout")) {
        throw new AIError("AI request timed out", "timeout");
      }
      throw new AIError(`AI provider unreachable: ${String(err).slice(0, 200)}`, "provider_error");
    });

    if (res.status === 429) throw new AIError("AI rate limit reached, try again later", "rate_limited");
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.warn("ai.anthropic.error", { status: res.status, body: body.slice(0, 300) });
      throw new AIError(`AI provider error (${res.status})`, "provider_error");
    }
    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = data.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    if (!text) throw new AIError("AI provider returned an empty response", "invalid_output");
    return {
      text,
      provider: this.name,
      model: this.model,
      tokensUsed: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
    };
  }
}

let cached: AIProvider | null | undefined;

export function getAIProvider(): AIProvider | null {
  if (cached !== undefined) return cached;
  const which = (process.env.AI_PROVIDER ?? "openai").toLowerCase();

  if (which === "anthropic") {
    const key = process.env.ANTHROPIC_API_KEY;
    cached = key
      ? new AnthropicProvider(key, process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5")
      : null;
  } else {
    const key = process.env.AI_API_KEY;
    cached = key
      ? new OpenAICompatibleProvider(
          key,
          process.env.AI_BASE_URL ?? "https://api.openai.com/v1",
          process.env.AI_MODEL ?? "gpt-4o-mini",
        )
      : null;
  }
  return cached;
}

/** Test hook: override provider instance. */
export function setAIProviderForTests(provider: AIProvider | null) {
  cached = provider;
}

export function aiLimits() {
  return {
    maxInputTokens: Number(process.env.AI_MAX_INPUT_TOKENS ?? 8000),
    maxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS ?? 2000),
    timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 30000),
    requestsPerUserPerHour: Number(process.env.AI_REQUESTS_PER_USER_PER_HOUR ?? 30),
  };
}
