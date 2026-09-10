import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createZernioClient } from "@/lib/zernio-client";
import { messagePreview } from "@/lib/message-preview";

interface ZernioAttachment {
  id?: string;
  type?: string;
  url?: string;
  filename?: string | null;
  previewUrl?: string | null;
}

const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;
const allowedAttachmentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

function attachmentType(file: File): "image" | "video" | "audio" | "file" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "file";
}

function attachmentUrl(
  conversationId: string,
  messageId: string,
  attachmentIndex: number,
  preview = false
): string {
  const params = new URLSearchParams({
    conversationId,
    messageId,
    attachmentIndex: String(attachmentIndex),
  });
  if (preview) params.set("preview", "true");
  return `/api/v1/messages/media?${params.toString()}`;
}

function mapAttachment(
  attachment: ZernioAttachment,
  conversationId: string,
  messageId: string,
  attachmentIndex: number
) {
  if (!attachment.url && !attachment.previewUrl) return null;

  return {
    id: attachment.id ?? null,
    type: attachment.type ?? "file",
    url: attachmentUrl(conversationId, messageId, attachmentIndex),
    filename: attachment.filename ?? null,
    previewUrl: attachment.previewUrl
      ? attachmentUrl(conversationId, messageId, attachmentIndex, true)
      : null,
  };
}

/**
 * GET /api/v1/messages?conversationId=...
 *
 * Fetches messages from the Zernio API (source of truth) instead of a local mirror.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const conversationId = request.nextUrl.searchParams.get("conversationId");
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }

  // Look up the Zernio conversation ID and workspace API key
  const { data: conversation } = await supabase
    .from("conversations")
    .select("late_conversation_id, workspace_id, channels(late_account_id)")
    .eq("id", conversationId)
    .single();

  if (!conversation?.late_conversation_id) {
    return NextResponse.json({ error: "Conversation not found or missing Zernio ID" }, { status: 404 });
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("late_api_key_encrypted")
    .eq("id", conversation.workspace_id)
    .single();

  if (!workspace?.late_api_key_encrypted) {
    return NextResponse.json({ error: "API key not configured" }, { status: 400 });
  }

  const channel = conversation.channels as { late_account_id: string } | null;
  if (!channel?.late_account_id) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  // Fetch messages from Zernio API
  try {
    const zernio = createZernioClient(workspace.late_api_key_encrypted);
    const res = await zernio.messages.getInboxConversationMessages({
      path: { conversationId: conversation.late_conversation_id },
      query: { accountId: channel.late_account_id },
    });

    // The Zernio endpoint returns { success, messages: [...] } — NOT { data }.
    const zernioMessages =
      (res.data as { messages?: unknown[] })?.messages ??
      (res.data as { data?: unknown[] })?.data ??
      [];

    // Map Zernio messages to the shape the inbox UI expects
    const messages = zernioMessages.map((m: any) => ({
      id: m.id,
      conversation_id: conversationId,
      direction: m.direction === "outgoing" || m.direction === "outbound"
        ? "outbound"
        : "inbound",
      text: m.text ?? m.message ?? null,
      attachments: m.attachments?.length && m.id
        ? m.attachments
            .map((attachment: ZernioAttachment, index: number) =>
              mapAttachment(attachment, conversationId, m.id, index)
            )
            .filter(Boolean)
        : null,
      quick_reply_payload: null,
      postback_payload: null,
      callback_data: null,
      platform_message_id: m.platformMessageId ?? null,
      sent_by_flow_id: null,
      sent_by_node_id: null,
      sent_by_user_id: null,
      status: "sent",
      created_at: m.sentAt ?? m.createdAt ?? new Date().toISOString(),
    }));

    return NextResponse.json(messages);
  } catch (error) {
    console.error("Failed to fetch messages from Zernio API:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/messages
 *
 * Sends a message via Zernio API. No local message storage — Zernio is the source of truth.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentType = request.headers.get("content-type") ?? "";
  let conversationId: string | null = null;
  let text = "";
  let file: File | null = null;

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const conversationIdValue = formData.get("conversationId");
    const textValue = formData.get("text");
    const fileValue = formData.get("file");
    conversationId = typeof conversationIdValue === "string" ? conversationIdValue : null;
    text = typeof textValue === "string" ? textValue.trim() : "";
    file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;
  } else {
    const body = await request.json();
    conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
    text = typeof body.text === "string" ? body.text.trim() : "";
  }

  if (!conversationId || (!text && !file)) {
    return NextResponse.json(
      { error: "conversationId and message content required" },
      { status: 400 }
    );
  }

  if (file && (file.size > MAX_ATTACHMENT_SIZE || !allowedAttachmentTypes.has(file.type))) {
    return NextResponse.json(
      { error: file.size > MAX_ATTACHMENT_SIZE ? "Attachment exceeds 25 MB" : "Unsupported attachment type" },
      { status: 400 }
    );
  }

  // Get conversation with channel info
  const { data: conversation } = await supabase
    .from("conversations")
    .select("*, channels(*)")
    .eq("id", conversationId)
    .single();

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  if (!conversation.late_conversation_id) {
    return NextResponse.json(
      { error: "No Zernio conversation ID linked to this conversation" },
      { status: 400 }
    );
  }

  const channel = conversation.channels as { late_account_id: string } | null;
  if (!channel?.late_account_id) {
    return NextResponse.json({ error: "Channel not found or missing Zernio account ID" }, { status: 404 });
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("late_api_key_encrypted")
    .eq("id", conversation.workspace_id)
    .single();

  if (!workspace?.late_api_key_encrypted) {
    return NextResponse.json({ error: "API key not configured" }, { status: 400 });
  }

  // Send via Zernio — binary attachments require multipart/form-data.
  try {
    let responseData: { data?: { messageId?: string } };

    if (file) {
      const uploadFormData = new FormData();
      uploadFormData.set("file", file, file.name);
      uploadFormData.set("contentType", file.type);

      const uploadResponse = await fetch("https://zernio.com/api/v1/media/upload-direct", {
        method: "POST",
        headers: { Authorization: `Bearer ${workspace.late_api_key_encrypted}` },
        body: uploadFormData,
      });
      const uploadData = await uploadResponse.json().catch(() => ({})) as {
        url?: string;
        error?: string;
      };
      if (!uploadResponse.ok || !uploadData.url) {
        throw new Error(uploadData.error ?? `Upload failed (${uploadResponse.status})`);
      }

      const zernio = createZernioClient(workspace.late_api_key_encrypted);
      const response = await zernio.messages.sendInboxMessage({
        path: { conversationId: conversation.late_conversation_id },
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: {
          accountId: channel.late_account_id,
          message: text || undefined,
          attachmentUrl: uploadData.url,
          attachmentType: attachmentType(file),
          attachmentName: attachmentType(file) === "file" ? file.name : undefined,
        },
      });
      responseData = response.data as { data?: { messageId?: string } };
    } else {
      const zernio = createZernioClient(workspace.late_api_key_encrypted);
      const response = await zernio.messages.sendInboxMessage({
        path: { conversationId: conversation.late_conversation_id },
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: { accountId: channel.late_account_id, message: text },
      });
      responseData = response.data as { data?: { messageId?: string } };
    }

    const messageId = responseData?.data?.messageId ?? null;
    const preview = text || (file ? `[${file.name}]` : "");

    // Update conversation's last message info (ZernFlow-specific metadata)
    await supabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: messagePreview(preview),
      })
      .eq("id", conversationId);

    // The client refreshes from Zernio after a successful attachment send.
    return NextResponse.json(
      {
        id: messageId ?? `sent-${Date.now()}`,
        conversation_id: conversationId,
        direction: "outbound",
        text: text || null,
        attachments: null,
        quick_reply_payload: null,
        postback_payload: null,
        callback_data: null,
        platform_message_id: messageId,
        sent_by_flow_id: null,
        sent_by_node_id: null,
        sent_by_user_id: user.id,
        status: "sent",
        created_at: new Date().toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to send message via Zernio API:", error);
    return NextResponse.json(
      { error: `Failed to send message: ${error}` },
      { status: 500 }
    );
  }
}
