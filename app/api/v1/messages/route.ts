import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createZernioClient } from "@/lib/zernio-client";
import { getWorkspaceCredentials } from "@/lib/workspace-credentials";
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

function parseIsoDate(value: unknown): string {
  if (!value) return new Date().toISOString();
  try {
    const d = new Date(value as string | number);
    if (isNaN(d.getTime())) return new Date().toISOString();
    return d.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

/**
 * GET /api/v1/messages?conversationId=...
 *
 * Reads messages from local Supabase database. If local database is missing recent
 * messages (or is empty), synchronizes missing messages from Zernio and persists them locally.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const conversationId = request.nextUrl.searchParams.get("conversationId");
  const forceSync = request.nextUrl.searchParams.get("sync") === "true";
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }

  // 1. Fetch from local Supabase messages table
  const { data: localMessages, error: localError } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (localError) {
    console.error("Failed to fetch local messages:", localError);
  }

  const messagesList = localMessages ?? [];

  // 2. Fetch conversation details to check if synchronization is needed
  const { data: conversation } = await supabase
    .from("conversations")
    .select("last_message_at, late_conversation_id, workspace_id, channel_id, channels(late_account_id)")
    .eq("id", conversationId)
    .single();

  if (!conversation?.late_conversation_id) {
    return NextResponse.json(messagesList);
  }

  // Determine if we need to sync with Zernio:
  // - If we have 0 local messages
  // - If forceSync is requested
  // - If conversation.last_message_at is newer than our latest local message created_at
  let needsSync = messagesList.length === 0 || forceSync;
  if (!needsSync && conversation.last_message_at && messagesList.length > 0) {
    const latestLocalTime = new Date(messagesList[messagesList.length - 1].created_at).getTime();
    const convLastMessageTime = new Date(conversation.last_message_at).getTime();
    if (convLastMessageTime - latestLocalTime > 1500) {
      needsSync = true;
    }
  }

  if (!needsSync) {
    return NextResponse.json(messagesList);
  }

  // 3. Fetch from Zernio and import missing messages
  const workspace = await getWorkspaceCredentials(conversation.workspace_id);

  const rawChannels = conversation.channels as unknown;
  const lateAccountId: string | null =
    (rawChannels as { late_account_id?: string })?.late_account_id ??
    (Array.isArray(rawChannels) ? (rawChannels[0] as { late_account_id?: string })?.late_account_id : null) ??
    null;

  if (!workspace?.late_api_key_encrypted || !lateAccountId) {
    return NextResponse.json(messagesList);
  }

  try {
    const zernio = createZernioClient(workspace.late_api_key_encrypted);
    const res = await zernio.messages.getInboxConversationMessages({
      path: { conversationId: conversation.late_conversation_id },
      // Fetch the newest page. With "asc", conversations over 100 messages
      // returned the oldest page, so recent messages never reached the UI.
      query: { accountId: lateAccountId, limit: 100, sortOrder: "desc" },
    });

    const zernioMessages =
      (res.data as { messages?: unknown[] })?.messages ??
      (res.data as { data?: unknown[] })?.data ??
      [];

    if (!zernioMessages.length) {
      return NextResponse.json(messagesList);
    }

    // Identify already-stored messages by platform_message_id and text/timestamp
    const knownPlatformIds = new Set<string>();
    for (const m of messagesList) {
      if (m.platform_message_id) {
        knownPlatformIds.add(m.platform_message_id);
      }
    }

    const missingRowsToInsert: any[] = [];

    for (let idx = 0; idx < zernioMessages.length; idx++) {
      const m: any = zernioMessages[idx];
      const platformMsgId = m.platformMessageId ?? m.id ?? null;

      if (platformMsgId && knownPlatformIds.has(platformMsgId)) {
        continue;
      }

      const formattedAttachments = Array.isArray(m.attachments) && m.attachments.length > 0
        ? m.attachments.map((att: ZernioAttachment, attIdx: number) => ({
            id: att.id ?? `att-${idx}-${attIdx}-${Date.now()}`,
            type: att.type ?? "file",
            url: att.url ?? att.previewUrl ?? "",
            filename: att.filename ?? null,
            previewUrl: att.previewUrl ?? null,
          }))
        : null;

      const direction = (m.direction === "outgoing" || m.direction === "outbound"
        ? "outbound"
        : "inbound") as "inbound" | "outbound";

      const createdAt = parseIsoDate(m.sentAt ?? m.createdAt ?? m.timestamp);

      missingRowsToInsert.push({
        conversation_id: conversationId,
        direction,
        text: m.text ?? m.message ?? null,
        attachments: formattedAttachments,
        quick_reply_payload: null,
        postback_payload: null,
        callback_data: null,
        platform_message_id: platformMsgId,
        sent_by_flow_id: null,
        sent_by_node_id: null,
        sent_by_user_id: null,
        status: "sent" as const,
        created_at: createdAt,
      });

      if (platformMsgId) {
        knownPlatformIds.add(platformMsgId);
      }
    }

    if (missingRowsToInsert.length > 0) {
      const { data: inserted, error: insertErr } = await supabase
        .from("messages")
        .insert(missingRowsToInsert)
        .select();

      if (insertErr) {
        console.error("Error inserting synced messages from Zernio:", insertErr);
      } else if (inserted) {
        // Return full combined list ordered by created_at
        const allMessages = [...messagesList, ...inserted].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        const latestMessage = allMessages[allMessages.length - 1];

        if (
          latestMessage &&
          (!conversation.last_message_at ||
            new Date(latestMessage.created_at).getTime() >
              new Date(conversation.last_message_at).getTime())
        ) {
          await supabase
            .from("conversations")
            .update({
              last_message_at: latestMessage.created_at,
              last_message_preview: messagePreview(latestMessage.text),
            })
            .eq("id", conversationId);
        }

        return NextResponse.json(allMessages);
      }
    }

    return NextResponse.json(messagesList);
  } catch (error) {
    console.error("Failed to sync messages from Zernio API:", error);
    return NextResponse.json(messagesList);
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

  const rawChannel = conversation.channels as unknown;
  const lateAccountId: string | null =
    (rawChannel as { late_account_id?: string })?.late_account_id ??
    (Array.isArray(rawChannel) ? (rawChannel[0] as { late_account_id?: string })?.late_account_id : null) ??
    null;

  if (!lateAccountId) {
    return NextResponse.json({ error: "Channel not found or missing Zernio account ID" }, { status: 404 });
  }

  const workspace = await getWorkspaceCredentials(conversation.workspace_id);

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
          accountId: lateAccountId,
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
        body: { accountId: lateAccountId, message: text },
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
