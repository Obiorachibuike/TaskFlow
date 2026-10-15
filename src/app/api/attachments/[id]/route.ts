import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { errorResponse, ServiceError } from "@/lib/api";
import { authorizeAttachmentDownload, deleteAttachment } from "@/lib/services/attachment";
import { getStorage } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const actor = await requireUser();
    const { id } = await ctx.params;
    // Explicit authorization — never serve files without a membership check
    const { attachment } = await authorizeAttachmentDownload(actor, id);
    const storage = getStorage();
    const file = await storage.get(attachment.storageKey);

    const headers: Record<string, string> = {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(attachment.sizeBytes),
      "Content-Disposition": `attachment; filename="${attachment.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    };
    if (file.stream) {
      return new NextResponse(file.stream as unknown as ReadableStream, { headers });
    }
    return new NextResponse(file.data as unknown as ArrayBuffer, { headers });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const actor = await requireUser();
    const { id } = await ctx.params;
    await deleteAttachment(actor, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

void ServiceError;
