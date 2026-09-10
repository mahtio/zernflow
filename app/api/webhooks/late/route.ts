import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveWebhookSecret, verifyWebhookSignature } from "@/lib/zernio-webhook";
import { executeFlow } from "@/lib/flow-engine/engine";
import { messagePreview } from "@/lib/message-preview";
import { upsertContactForSender } from "@/lib/inbox-sync";
import type { Database } from "@/lib/types/database";

interface WebhookPayload {
  id?: string;
  event: string;
  message: {
    id: string;
    conversationId: string;
    platform: string;
    platformMessageId?: string;
    direction?: string;
    text?: string | null;
    attachments?: Array<{ type?: string; url?: string; payload?: string; filename?: string; previewUrl?: string }>;
    sender: {
      id: string;
      name?: string;
      username?: string | null;
      picture?: string | null;
    };
    sentAt?: string;
    isRead?: boolean;
  };
  conversation: {
    id: string;
    platform: string;
    participant: {
      id: string;
      name?: string;
      username?: string | null;
      picture?: string | null;
    };
  };
  account: {
    id: string;
    platform: string;
  };
  metadata?: {
    postbackPayload?: string;
    quickReplyPayload?: string;
    callbackData?: string;
    trigger?: string;
    commentId?: string;
    mediaId?: string;
  };
}

interface CommentWebhookPayload {
  id?: string;
  event: "comment.received";
  comment: {
    id: string;
    text: string;
    mediaId: string;
    mediaUrl?: string;
    sender: {
      id: string;
      username: string;
      name?: string;
      picture?: string | null;
    };
    createdAt: string;
    parentId?: string;
  };
  account: {
    id: string;
    platform: string;
  };
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

// ── Webhook handler ─────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    return await handleWebhook(request);
  } catch (err) {
    console.error("Webhook handler error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

async function claimWebhookEvent(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  eventId: string | null | undefined
): Promise<boolean> {
  if (!eventId) return true;
  const { error } = await supabase
    .from("webhook_events")
    .insert({ event_id: eventId });
  if (!error) return true;
  if (error.code === "23505") return false;
  console.error("webhook_events claim failed:", error);
  return true;
}

async function handleWebhook(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("x-late-signature");
  const headerEventId = request.headers.get("x-late-event-id");

  let parsed: { event?: string; id?: string };
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = parsed.id || headerEventId;

  if (parsed.event === "comment.received") {
    return handleCommentWebhook(parsed as CommentWebhookPayload, body, signature, eventId);
  }

  // Everything else besides message.received is acknowledged and ignored
  if (parsed.event !== "message.received") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const payload = parsed as WebhookPayload;
  const { message: msg, account } = payload;

  // Ignore outbound messages (sent by the bot or agent itself) to prevent loops
  if (msg.direction === "outbound" || msg.direction === "outgoing") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const supabase = await createServiceClient();

  // Look up channel by late_account_id
  const { data: channel } = await supabase
    .from("channels")
    .select("*")
    .eq("late_account_id", account.id)
    .eq("is_active", true)
    .single();

  if (!channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  // Prevent loops if sender is own connected account
  if (msg.sender.username) {
    const { data: senderChannel } = await supabase
      .from("channels")
      .select("id")
      .eq("workspace_id", channel.workspace_id)
      .eq("username", msg.sender.username)
      .eq("is_active", true)
      .maybeSingle();

    if (senderChannel) {
      return NextResponse.json({ ok: true, skipped: true, reason: "sender_is_own_account" });
    }
  }

  // Verify HMAC-SHA256 signature
  const secret = await resolveWebhookSecret(supabase, channel);
  if (secret && !verifyWebhookSignature(secret, body, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (!(await claimWebhookEvent(supabase, eventId))) {
    return NextResponse.json({ ok: true, skipped: true, reason: "duplicate_event" });
  }

  // Synchronously persist contact, conversation, and message to Supabase
  // so the message is 100% saved in the DB and Supabase Realtime fires immediately.
  const processed = await processMessagePersistence(supabase, payload, channel);

  // Run flows / automation in the background
  if (processed?.conversation && !processed.conversation.is_automation_paused) {
    after(async () => {
      try {
        await runFlowExecution(supabase, payload, channel, processed.contactId, processed.conversation);
      } catch (err) {
        console.error("Background flow execution error:", err);
      }
    });
  }

  return NextResponse.json({ ok: true });
}

/**
 * Persists contact, conversation, and inbound message synchronously to Supabase.
 */
async function processMessagePersistence(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  payload: WebhookPayload,
  channel: Database["public"]["Tables"]["channels"]["Row"],
) {
  const { message: msg, conversation: conv, metadata } = payload;

  const senderId = msg.sender.id;
  const senderName = msg.sender.name || msg.sender.username || senderId;

  const contact = await upsertContactForSender({
    supabase,
    channel,
    senderId,
    senderName,
    senderPicture: msg.sender.picture || null,
    senderUsername: msg.sender.username || null,
    interactionAt: new Date().toISOString(),
  });

  if (!contact) {
    console.error("Failed to create contact for webhook message");
    return null;
  }

  const contactId = contact.contactId;
  const preview = messagePreview(msg.text);

  const { data: conversation, error: convErr } = await supabase
    .from("conversations")
    .upsert(
      {
        workspace_id: channel.workspace_id,
        channel_id: channel.id,
        contact_id: contactId,
        platform: channel.platform,
        late_conversation_id: conv.id,
        status: "open",
        last_message_at: new Date().toISOString(),
        last_message_preview: preview,
        unread_count: 1,
      },
      { onConflict: "channel_id,contact_id" }
    )
    .select("id, is_automation_paused")
    .single();

  if (convErr || !conversation) {
    console.error("Failed to upsert conversation:", convErr);
    return null;
  }

  if (contact.existed) {
    await supabase.rpc("increment_unread", {
      conv_id: conversation.id,
      preview,
    });
  }

  // Check if message already exists
  const platformMessageId = msg.platformMessageId || (msg.id && !msg.id.startsWith("conv_") ? msg.id : null);
  let shouldInsertMessage = true;

  if (platformMessageId) {
    const { data: existingMessage } = await supabase
      .from("messages")
      .select("id")
      .eq("conversation_id", conversation.id)
      .eq("platform_message_id", platformMessageId)
      .maybeSingle();

    if (existingMessage) {
      shouldInsertMessage = false;
    }
  }

  if (shouldInsertMessage) {
    const formattedAttachments = Array.isArray(msg.attachments) && msg.attachments.length > 0
      ? msg.attachments.map((att: any, index: number) => ({
          id: att.id ?? `att-${index}-${Date.now()}`,
          type: att.type ?? "file",
          url: att.url,
          filename: att.filename ?? (att.payload ? String(att.payload) : null),
          previewUrl: att.previewUrl ?? null,
        }))
      : null;

    const messageCreatedAt = parseIsoDate(msg.sentAt);

    const { error: insertMessageError } = await supabase.from("messages").insert({
      conversation_id: conversation.id,
      direction: "inbound",
      text: msg.text || null,
      attachments: formattedAttachments,
      quick_reply_payload: metadata?.quickReplyPayload || null,
      postback_payload: metadata?.postbackPayload || null,
      callback_data: metadata?.callbackData || null,
      platform_message_id: platformMessageId,
      sent_by_flow_id: null,
      sent_by_node_id: null,
      sent_by_user_id: null,
      status: "delivered",
      created_at: messageCreatedAt,
    });

    if (insertMessageError) {
      console.error("Failed to mirror inbound message to Supabase:", insertMessageError);
    }
  }

  return { contactId, conversation };
}

/**
 * Executes automations and flows for inbound messages in the background.
 */
async function runFlowExecution(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  payload: WebhookPayload,
  channel: Database["public"]["Tables"]["channels"]["Row"],
  contactId: string,
  conversation: { id: string; is_automation_paused: boolean },
) {
  const { message: msg, conversation: conv, metadata } = payload;

  const incomingMessage = {
    text: msg.text || undefined,
    postbackPayload: metadata?.postbackPayload || undefined,
    quickReplyPayload: metadata?.quickReplyPayload || undefined,
    callbackData: metadata?.callbackData || undefined,
    sender: {
      id: msg.sender.id,
      name: msg.sender.name,
      username: msg.sender.username || undefined,
    },
  };

  const handled = await handleGlobalKeywords(
    supabase,
    channel.workspace_id,
    contactId,
    msg.text || undefined
  );

  if (!handled) {
    const flowContext = {
      triggerId: "",
      flowId: "",
      channelId: channel.id,
      contactId,
      conversationId: conversation.id,
      workspaceId: channel.workspace_id,
      incomingMessage,
      lateConversationId: conv.id,
    };

    let triggerType = "message_received";
    if (metadata?.quickReplyPayload || metadata?.postbackPayload) {
      triggerType = "button_clicked";
    }

    const { data: flows } = await supabase
      .from("flows")
      .select("*")
      .eq("workspace_id", channel.workspace_id)
      .eq("status", "published");

    if (flows) {
      for (const flow of flows) {
        const nodes = (flow.nodes as Array<{
          id: string;
          type: string;
          data?: Record<string, unknown>;
        }>) || [];

        const matchingTrigger = nodes.find(
          (n) =>
            n.type === "trigger" &&
            (n.data?.triggerType === triggerType ||
              n.data?.triggerType === "message_received" ||
              (!n.data?.triggerType && triggerType === "message_received"))
        );

        if (matchingTrigger) {
          await executeFlow(supabase, {
            ...flowContext,
            triggerId: matchingTrigger.id,
            flowId: flow.id,
          });
          break;
        }
      }
    }
  }
}

async function handleGlobalKeywords(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  workspaceId: string,
  contactId: string,
  text: string | undefined
): Promise<boolean> {
  if (!text) return false;

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("global_keywords")
    .eq("id", workspaceId)
    .single();

  if (!workspace?.global_keywords) return false;

  const normalizedText = text.toLowerCase().trim();
  const keywords = workspace.global_keywords as Array<
    string | { keyword: string; action?: string }
  >;

  for (const entry of keywords) {
    const keyword = typeof entry === "string" ? entry : entry.keyword;
    if (normalizedText !== keyword.toLowerCase()) continue;

    if (typeof entry !== "string" && (entry.action === "subscribe" || entry.action === "unsubscribe")) {
      await supabase
        .from("contacts")
        .update({ is_subscribed: entry.action === "subscribe" })
        .eq("id", contactId);
      return true;
    }
  }

  return false;
}

// ── Comment webhook handler ──────────────────────────────────────────────────

async function handleCommentWebhook(
  payload: CommentWebhookPayload,
  rawBody: string,
  signature: string | null,
  eventId: string | null | undefined
) {
  const { comment, account } = payload;
  const supabase = await createServiceClient();

  const { data: channel } = await supabase
    .from("channels")
    .select("*")
    .eq("late_account_id", account.id)
    .eq("is_active", true)
    .single();

  if (!channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  const secret = await resolveWebhookSecret(supabase, channel);
  if (secret && !verifyWebhookSignature(secret, rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (!(await claimWebhookEvent(supabase, eventId))) {
    return NextResponse.json({ ok: true, skipped: true, reason: "duplicate_event" });
  }

  after(async () => {
    try {
      await processCommentEvent(supabase, payload, channel);
    } catch (err) {
      console.error("Webhook comment processing error:", err);
    }
  });

  return NextResponse.json({ ok: true, queued: true });
}

async function processCommentEvent(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  payload: CommentWebhookPayload,
  channel: Database["public"]["Tables"]["channels"]["Row"]
) {
  const { comment } = payload;

  const contact = await upsertContactForSender({
    supabase,
    channel,
    senderId: comment.sender.id,
    senderName: comment.sender.name || comment.sender.username,
    senderPicture: comment.sender.picture || null,
    senderUsername: comment.sender.username || null,
    interactionAt: new Date().toISOString(),
  });

  if (!contact) {
    console.error("Failed to create contact for comment");
    return;
  }

  const contactId = contact.contactId;

  const { data: flows } = await supabase
    .from("flows")
    .select("*")
    .eq("workspace_id", channel.workspace_id)
    .eq("status", "published");

  if (!flows?.length) return;

  for (const flow of flows) {
    const nodes = (flow.nodes as Array<{
      id: string;
      type: string;
      data?: Record<string, unknown>;
    }>) || [];

    const commentTrigger = nodes.find(
      (n) =>
        n.type === "trigger" &&
        (n.data?.triggerType === "comment_received" ||
          n.data?.triggerType === "post_comment")
    );

    if (!commentTrigger) continue;

    const triggerData = commentTrigger.data || {};
    if (
      triggerData.mediaId &&
      triggerData.mediaId !== comment.mediaId
    ) {
      continue;
    }

    if (triggerData.keywords && Array.isArray(triggerData.keywords) && triggerData.keywords.length > 0) {
      const commentLower = comment.text.toLowerCase();
      const matches = (triggerData.keywords as string[]).some((kw: string) =>
        commentLower.includes(kw.toLowerCase().trim())
      );
      if (!matches) continue;
    }

    await executeFlow(supabase, {
      triggerId: commentTrigger.id,
      flowId: flow.id,
      channelId: channel.id,
      contactId,
      conversationId: "",
      workspaceId: channel.workspace_id,
      incomingMessage: {
        text: comment.text,
        sender: {
          id: comment.sender.id,
          name: comment.sender.name || comment.sender.username,
          username: comment.sender.username,
        },
      },
      variables: {
        comment_id: comment.id,
        post_id: comment.mediaId,
        comment_text: comment.text,
        username: comment.sender.username,
      },
    });

    break;
  }
}
