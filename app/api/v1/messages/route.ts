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

/**
 * GET /api/v1/messages?conversationId=...
 *
 * Reads messages directly from local Supabase database for instant 0ms latency.
 * If local database has no messages yet for this conversation, performs an
 * on-demand backfill from Zernio and saves them to Supabase.
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

  // 1. Primary query: fetch from local Supabase messages table
  const { data: localMessages, error: localError } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (localError) {
    console.error("Failed to fetch local messages:", localError);
  }

  // If we already have local messages, return them immediately
  if (localMessages && localMessages.length > 0) {
    return NextResponse.json(localMessages);
  }

  // 2. Fallback / Backfill: look up conversation in Zernio if local is empty
  const { data: conversation } = await supabase
    .from("conversations")
    .select("late_conversation_id, workspace_id, channels(late_account_id)")
    .eq("id", conversationId)
    .single();

  if (!conversation?.late_conversation_id) {
    return NextResponse.json(localMessages ?? []);
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("late_api_key_encrypted")
    .eq("id", conversation.workspace_id)
    .single();

  if (!workspace?.late_api_key_encrypted) {
    return NextResponse.json(localMessages ?? []);
  }

  const channel = conversation.channels as { late_account_id: string } | null;
  if (!channel?.late_account_id) {
    return NextResponse.json(localMessages ?? []);
  }

  // Fetch messages from Zernio API for backfill
  try {
    const zernio = createZernioClient(workspace.late_api_key_encrypted);
    const res = await zernio.messages.getInboxConversationMessages({
      path: { conversationId: conversation.late_conversation_id },
      query: { accountId: channel.late_account_id, limit: 100, sortOrder: "asc" },
    });

    const zernioMessages =
      (res.data as { messages?: unknown[] })?.messages ??
      (res.data as { data?: unknown[] })?.data ??
      [];

    if (!zernioMessages.length) {
      return NextResponse.json([]);
    }

    // Map Zernio messages to Supabase rows
    const rowsToInsert = zernioMessages.map((m: any, idx: number) => {
      const formattedAttachments = Array.isArray(m.attachments) && m.attachments.length > 0
        ? m.attachments.map((att: ZernioAttachment, attIdx: number) => ({
            id: att.id ?? `att-${idx}-${attIdx}-${Date.now()}`,
            type: att.type ?? "file",
            url: att.url ?? att.previewUrl ?? "",
            filename: att.filename ?? null,
            previewUrl: att.previewUrl ?? null,
          }))
        : null;

      return {
        conversation_id: conversationId,
        direction: (m.direction === "outgoing" || m.direction === "outbound"
          ? "outbound"
          : "inbound") as "inbound" | "outbound",
        text: m.text ?? m.message ?? null,
        attachments: formattedAttachments,
        quick_reply_payload: null,
        postback_payload: null,
        callback_data: null,
        platform_message_id: m.platformMessageId ?? m.id ?? null,
        sent_by_flow_id: null,
        sent_by_node_id: null,
        sent_by_user_id: null,
        status: "sent" as const,
        created_at: m.sentAt ?? m.createdAt ?? new Date().toISOString(),
      };
    });

    // Bulk insert backfilled messages into Supabase
    const { data: insertedMessages, error: insertError } = await supabase
      .from("messages")
      .insert(rowsToInsert)
      .select();

    if (insertError) {
      console.error("Backfill insert error:", insertError);
      return NextResponse.json(rowsToInsert);
    }

    return NextResponse.json(insertedMessages ?? rowsToInsert);
  } catch (error) {
    console.error("Failed to backfill messages from Zernio API:", error);
    return NextResponse.json(localMessages ?? []);
  }
}

/**
 * POST /api/v1/messages
 *
 * Sends a message via Zernio API and mirrors it immediately in local Supabase database.
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

  try {
    let responseData: { data?: { messageId?: string } };
    let attachmentsPayload: Array<{
      id: string;
      type: string;
      url: string;
      filename: string | null;
      previewUrl: string | null;
    }> | null = null;

    if (file) {
      const uploadFormData = new FormData();
      uploadFormData.set("file", file, file.name);
      uploadFormData.set("contentType", file.type);

      const uploadResponse = await fetch("https://zernio.com/api/v1/media/upload-direct", {
        method: "POST",
        headers: { Authorization: `Bearer ${workspace.late_api_key_encrypted}` },
        body: uploadFormData,
      });
      const uploadData = (await uploadResponse.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!uploadResponse.ok || !uploadData.url) {
        throw new Error(uploadData.error ?? `Upload failed (${uploadResponse.status})`);
      }

      const fileKind = attachmentType(file);
      const zernio = createZernioClient(workspace.late_api_key_encrypted);
      const response = await zernio.messages.sendInboxMessage({
        path: { conversationId: conversation.late_conversation_id },
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: {
          accountId: channel.late_account_id,
          message: text || undefined,
          attachmentUrl: uploadData.url,
          attachmentType: fileKind,
          attachmentName: fileKind === "file" ? file.name : undefined,
        },
      });
      responseData = response.data as { data?: { messageId?: string } };

      attachmentsPayload = [
        {
          id: `att-${Date.now()}`,
          type: fileKind,
          url: uploadData.url,
          filename: file.name,
          previewUrl: fileKind === "image" ? uploadData.url : null,
        },
      ];
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

    // Update conversation's last message info
    await supabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: messagePreview(preview),
      })
      .eq("id", conversationId);

    // Persist outbound message in local Supabase database
    const { data: insertedMessage, error: insertError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        direction: "outbound",
        text: text || null,
        attachments: attachmentsPayload,
        quick_reply_payload: null,
        postback_payload: null,
        callback_data: null,
        platform_message_id: messageId,
        sent_by_flow_id: null,
        sent_by_node_id: null,
        sent_by_user_id: user.id,
        status: "sent",
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to insert outbound message locally:", insertError);
    }

    return NextResponse.json(
      insertedMessage ?? {
        id: messageId ?? `sent-${Date.now()}`,
        conversation_id: conversationId,
        direction: "outbound",
        text: text || null,
        attachments: attachmentsPayload,
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
      { error: `Failed to send message: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
