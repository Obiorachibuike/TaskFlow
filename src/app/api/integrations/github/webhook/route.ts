import { NextResponse, type NextRequest } from "next/server";
import { verifyGithubSignature, processGithubWebhook } from "@/lib/integrations/github";
import { logger } from "@/lib/logger";

/**
 * GitHub webhook receiver. Verifies X-Hub-Signature-256 over the raw body
 * before any processing. No user session — authenticity comes from the HMAC.
 */
export async function POST(req: NextRequest) {
  const raw = Buffer.from(await req.arrayBuffer());
  const signature = req.headers.get("x-hub-signature-256");
  const eventType = req.headers.get("x-github-event") ?? "unknown";
  const deliveryId = req.headers.get("x-github-delivery") ?? `local-${Date.now()}`;

  if (!verifyGithubSignature(raw, signature)) {
    logger.warn("github.webhook.invalid_signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await processGithubWebhook({ deliveryId, eventType, payload });
  return NextResponse.json(result);
}
