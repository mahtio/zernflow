import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createZernioClient } from "@/lib/zernio-client";

interface ZernioAttachment {
  type?: string;
  url?: string;
  previewUrl?: string | null;
}

const fallbackContentTypes: Record<string, string> = {
  image: "image/jpeg",
  sticker: "image/webp",
  video: "video/mp4",
  audio: "audio/ogg",
  file: "application/octet-stream",
};

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const conversationId = request.nextUrl.searchParams.get("conversationId");
  const messageId = request.nextUrl.searchParams.get("messageId");
  const attachmentIndex = Number(request.nextUrl.searchParams.get("attachmentIndex"));
  const preview = request.nextUrl.searchParams.get("preview") === "true";
  if (!conversationId || !messageId || !Number.isInteger(attachmentIndex) || attachmentIndex < 0) {
    return NextResponse.json({ error: "Invalid media request" }, { status: 400 });
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("late_conversation_id, workspace_id, channels(late_account_id)")
    .eq("id", conversationId)
    .single();

  const channel = conversation?.channels as { late_account_id: string } | null;
  if (!conversation?.late_conversation_id || !channel?.late_account_id) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("late_api_key_encrypted")
    .eq("id", conversation.workspace_id)
    .single();

  if (!workspace?.late_api_key_encrypted) {
    return NextResponse.json({ error: "API key not configured" }, { status: 400 });
  }

  try {
    const zernio = createZernioClient(workspace.late_api_key_encrypted);
    const messagesResponse = await zernio.messages.getInboxConversationMessages({
      path: { conversationId: conversation.late_conversation_id },
      query: { accountId: channel.late_account_id, limit: 100, sortOrder: "asc" },
    });
    const messages = (messagesResponse.data as { messages?: Array<{ id?: string; attachments?: ZernioAttachment[] }> })?.messages ?? [];
    const message = messages.find((item) => item.id === messageId);
    const attachment = message?.attachments?.[attachmentIndex];
    const sourceUrl = preview ? attachment?.previewUrl : attachment?.url;
    if (!attachment || !sourceUrl) {
      return NextResponse.json({ error: "Attachment is unavailable" }, { status: 404 });
    }

    const parsedUrl = new URL(sourceUrl);
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      return NextResponse.json({ error: "Invalid attachment URL" }, { status: 400 });
    }

    const mediaMatch = parsedUrl.pathname.match(/\/v1\/whatsapp\/media\/([^/]+)$/);
    const isProtectedZernioMedia = parsedUrl.hostname === "zernio.com" && mediaMatch;
    if (parsedUrl.hostname === "zernio.com" && !isProtectedZernioMedia) {
      return NextResponse.json({ error: "Invalid attachment URL" }, { status: 400 });
    }

    if (isProtectedZernioMedia) {
      parsedUrl.searchParams.set("accountId", channel.late_account_id);
    }

    const upstreamHeaders: HeadersInit = {};
    if (isProtectedZernioMedia) {
      upstreamHeaders.Authorization = `Bearer ${workspace.late_api_key_encrypted}`;
    }
    const range = request.headers.get("range");
    if (range) upstreamHeaders.Range = range;

    const mediaResponse = await fetch(parsedUrl, {
      headers: upstreamHeaders,
      cache: "no-store",
      redirect: "error",
    });

    if (!mediaResponse.ok || !mediaResponse.body) {
      return NextResponse.json(
        { error: "Attachment is unavailable or expired" },
        { status: mediaResponse.status === 404 ? 404 : 502 }
      );
    }

    const upstreamContentType = mediaResponse.headers.get("content-type");
    const contentType = upstreamContentType && upstreamContentType !== "application/octet-stream"
      ? upstreamContentType
      : fallbackContentTypes[attachment.type ?? "file"] ?? fallbackContentTypes.file;

    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set("Cache-Control", "private, max-age=300");
    headers.set("Accept-Ranges", mediaResponse.headers.get("accept-ranges") ?? "bytes");
    const contentLength = mediaResponse.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);
    const contentRange = mediaResponse.headers.get("content-range");
    if (contentRange) headers.set("Content-Range", contentRange);
    const disposition = mediaResponse.headers.get("content-disposition");
    if (disposition) headers.set("Content-Disposition", disposition);

    return new NextResponse(mediaResponse.body, {
      status: mediaResponse.status,
      headers,
    });
  } catch (error) {
    console.error("Failed to fetch Zernio media:", error);
    return NextResponse.json({ error: "Failed to fetch attachment" }, { status: 502 });
  }
}
