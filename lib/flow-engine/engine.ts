import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, NodeType } from "@/lib/types/database";
import type {
  FlowNode,
  FlowEdge,
  FlowExecutionContext,
  SendMessageNodeData,
  ConditionNodeData,
  DelayNodeData,
  SmartDelayNodeData,
  TagNodeData,
  SetFieldNodeData,
  HttpRequestNodeData,
  GoToFlowNodeData,
  ABSplitNodeData,
  CommentReplyNodeData,
  PrivateReplyNodeData,
  AiResponseNodeData,
  EnrollSequenceNodeData,
} from "./types";
import { executeAiResponse } from "./nodes/ai-response";
import { adaptMessage } from "./platform-adapter";
import { createZernioClient } from "@/lib/zernio-client";
import { createTrackedLinkToken, createTrackedLinkUrl } from "@/lib/tracked-link";
import { createOptionPayload, parseOptionPayload, resolveOptionEdge } from "./interaction-resolver";
import { optionHandle } from "./message-options";

export async function executeFlow(
  supabase: SupabaseClient<Database>,
  context: FlowExecutionContext
) {
  // Ensure variables always exists so nodes (aiResponse, httpRequest) can write
  // outputs even when the trigger passed none (e.g. DM-triggered flows).
  context.variables ??= {};

  // Seed {{message}} from the incoming message text so the variable offered in
  // the builder resolves in production, not just in the simulator (which seeds
  // it itself). Guarded so cron resumes with an empty incomingMessage don't
  // clobber a previously stored value.
  if (context.incomingMessage.text) {
    context.variables.message ??= context.incomingMessage.text;
  }

  // A reply must resume an eligible waiting session before evaluating a new flow.
  if (!context.reservedSessionId && await resumeWaitingSession(supabase, context)) return;

  // Load flow
  const { data: flow } = await supabase
    .from("flows")
    .select("*")
    .eq("id", context.flowId)
    .eq("status", "published")
    .single();

  if (!flow) return;

  const nodes = flow.nodes as unknown as FlowNode[];
  const edges = flow.edges as unknown as FlowEdge[];
  context.publishedVersion = flow.version;

  // Get channel platform and late_account_id
  const { data: channel } = await supabase
    .from("channels")
    .select("platform, late_account_id")
    .eq("id", context.channelId)
    .single();

  context.platform = channel?.platform as FlowExecutionContext["platform"];
  if (channel?.late_account_id && !context.lateAccountId) {
    context.lateAccountId = channel.late_account_id;
  }

  // Resolve late_conversation_id from the conversation record if not already set
  if (!context.lateConversationId && context.conversationId) {
    const { data: conversation } = await supabase
      .from("conversations")
      .select("late_conversation_id")
      .eq("id", context.conversationId)
      .single();

    if (conversation?.late_conversation_id) {
      context.lateConversationId = conversation.late_conversation_id;
    }
  }

  // A flow switch may reserve the successor in the same transaction that
  // cancels the old wait. Ordinary starts create a fresh session here.
  const session = context.reservedSessionId
    ? { id: context.reservedSessionId }
    : (await supabase
        .from("flow_sessions")
        .insert({
          contact_id: context.contactId,
          flow_id: context.flowId,
          channel_id: context.channelId,
          status: "active",
          variables: context.variables || {},
          consumed_event_id: context.inboundEventId || null,
          published_version: flow.version,
        })
        .select("id")
        .single()).data;

  if (!session) return;

  // Track flow_started
  await supabase.from("analytics_events").insert({
    workspace_id: context.workspaceId,
    flow_id: context.flowId,
    contact_id: context.contactId,
    event_type: "flow_started",
    metadata: { triggerId: context.triggerId },
  });

  // Find the trigger node (entry point)
  const triggerNode = nodes.find((n) => n.type === "trigger");
  if (!triggerNode) return;

  // Get the first connected node
  const firstEdge = edges.find((e) => e.source === triggerNode.id);
  if (!firstEdge) return;

  const startNode = nodes.find((n) => n.id === firstEdge.target);
  if (!startNode) return;

  await traverseNodes(supabase, session.id, startNode, nodes, edges, context, 0);
}

const MAX_TRAVERSAL_DEPTH = 50;

// Thrown before resumeSession advances current_node_id, so callers may retry
// without cancelling the session.
export class FlowLoadError extends Error {}

export async function resumeWaitingSession(
  supabase: SupabaseClient<Database>,
  context: FlowExecutionContext
): Promise<boolean> {
  const { data: activeSession, error } = await supabase
    .from("flow_sessions")
    .select("*")
    .eq("contact_id", context.contactId)
    .eq("channel_id", context.channelId)
    .eq("status", "active")
    .eq("waiting_for_input", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new FlowLoadError(
      `waiting session for contact ${context.contactId} could not be loaded: ${error.message}`
    );
  }
  if (!activeSession) return false;

  await resumeSession(supabase, activeSession, {
    ...context,
    flowId: activeSession.flow_id,
  });
  return true;
}

export async function reactivateExpiredOptionSession(
  supabase: SupabaseClient<Database>,
  context: FlowExecutionContext,
  eventId: string
): Promise<boolean> {
  const payload = parseOptionPayload(context.incomingMessage.postbackPayload || context.incomingMessage.quickReplyPayload);
  if (!payload) return false;
  const { data: expired } = await supabase
    .from("flow_sessions")
    .select("*")
    .eq("contact_id", context.contactId)
    .eq("channel_id", context.channelId)
    .eq("flow_id", payload.flowId)
    .eq("status", "expired")
    .eq("waiting_node_id", payload.nodeId)
    .eq("published_version", payload.version)
    .contains("accepted_option_ids", [payload.optionId])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!expired) return false;

  const { data: reactivated, error } = await supabase
    .from("flow_sessions")
    .insert({
      contact_id: expired.contact_id,
      flow_id: expired.flow_id,
      channel_id: expired.channel_id,
      status: "active",
      current_node_id: expired.waiting_node_id,
      variables: expired.variables,
      flow_stack: expired.flow_stack,
      waiting_for_input: true,
      waiting_type: expired.waiting_type,
      waiting_node_id: expired.waiting_node_id,
      published_version: expired.published_version,
      accepted_option_ids: expired.accepted_option_ids,
      predecessor_session_id: expired.id,
      consumed_event_id: eventId,
    })
    .select("*")
    .single();
  if (error?.code === "23505") return true;
  if (error) throw new FlowLoadError(`late option session could not be created: ${error.message}`);
  if (!reactivated) return false;
  await resumeSession(supabase, reactivated, { ...context, flowId: expired.flow_id });
  return true;
}

export async function resumeSession(
  supabase: SupabaseClient<Database>,
  session: Database["public"]["Tables"]["flow_sessions"]["Row"],
  context: FlowExecutionContext
) {
  const { data: flow, error: flowError } = await supabase
    .from("flows")
    .select("*")
    .eq("id", session.flow_id)
    .single();

  if (!flow) {
    // postgrest-js swallows transient failures into { data: null, error }, it
    // does not throw. Only PGRST116 (zero rows) means the flow row is genuinely
    // gone; anything else is a transient DB/network blip, so throw and let the
    // caller recover (cron retry with backoff, or the contact's next message on
    // the webhook path) instead of permanently cancelling the session.
    if (flowError && flowError.code !== "PGRST116") {
      throw new FlowLoadError(
        `flow ${session.flow_id} could not be loaded: ${flowError.message}`
      );
    }
    await cancelUnresumableSession(
      supabase,
      session.id,
      `flow ${session.flow_id} no longer exists`
    );
    return;
  }

  let graphNodes = flow.nodes;
  let graphEdges = flow.edges;
  if (session.published_version && session.published_version !== flow.version) {
    const { data: version } = await supabase
      .from("flow_versions")
      .select("nodes, edges")
      .eq("flow_id", session.flow_id)
      .eq("version", session.published_version)
      .maybeSingle();
    if (!version) {
      await cancelUnresumableSession(supabase, session.id, `published version ${session.published_version} no longer exists`);
      return;
    }
    graphNodes = version.nodes;
    graphEdges = version.edges;
  }
  const nodes = graphNodes as unknown as FlowNode[];
  const edges = graphEdges as unknown as FlowEdge[];
  context.publishedVersion = session.published_version ?? flow.version;

  const { data: channel } = await supabase
    .from("channels")
    .select("platform, late_account_id")
    .eq("id", context.channelId)
    .single();

  context.platform = channel?.platform as FlowExecutionContext["platform"];
  if (channel?.late_account_id && !context.lateAccountId) {
    context.lateAccountId = channel.late_account_id;
  }

  // Resolve late_conversation_id if not set
  if (!context.lateConversationId && context.conversationId) {
    const { data: conversation } = await supabase
      .from("conversations")
      .select("late_conversation_id")
      .eq("id", context.conversationId)
      .single();

    if (conversation?.late_conversation_id) {
      context.lateConversationId = conversation.late_conversation_id;
    }
  }

  context.variables = (session.variables as Record<string, string>) || {};

  // The resume is driven by a fresh reply; make {{message}} reflect it.
  if (context.incomingMessage.text) {
    context.variables.message = context.incomingMessage.text;
  }

  const currentNode = nodes.find((n) => n.id === session.current_node_id);
  if (!currentNode) {
    await cancelUnresumableSession(supabase, session.id, `node ${session.current_node_id} no longer exists in flow ${session.flow_id}`);
    return;
  }
  const optionPayload = parseOptionPayload(context.incomingMessage.postbackPayload || context.incomingMessage.quickReplyPayload);
  const selected = optionPayload && optionPayload.flowId === session.flow_id && optionPayload.nodeId === currentNode.id
    ? resolveOptionEdge(currentNode, edges, optionPayload.optionId)
    : null;
  const waitingOptionIds = Array.isArray(session.accepted_option_ids) ? session.accepted_option_ids as string[] : [];
  if (session.waiting_type === "message_option" && (!selected || !waitingOptionIds.includes(selected.option.id))) {
    return;
  }
  if (selected) {
    context.variables.interaction_type = selected.option.kind === "quick_reply" ? "quick_reply" : selected.option.kind === "url" ? "link" : "postback";
    context.variables.selected_option_id = selected.option.id;
    context.variables.selected_option_title = selected.option.title;
    if (selected.option.kind !== "url") context.variables.dm_window_opened_at = new Date().toISOString();
  }

  // Claim the exact waiting state atomically. Duplicate webhooks/link clicks see
  // no returned row and cannot traverse the next node a second time.
  if (session.waiting_for_input) {
    const { data: claimed, error: claimError } = await supabase
      .from("flow_sessions")
      .update({
        waiting_for_input: false,
        waiting_until: null,
        wait_expires_at: null,
        ended_reason: selected ? "choice" : "reply",
        selected_option_id: selected?.option.id ?? null,
        dm_window_opened_at: selected && selected.option.kind !== "url" ? new Date().toISOString() : session.dm_window_opened_at,
        variables: context.variables as Json,
      })
      .eq("id", session.id)
      .eq("status", "active")
      .eq("waiting_for_input", true)
      .select("id")
      .maybeSingle();
    if (claimError) throw new FlowLoadError(`session ${session.id} could not be claimed: ${claimError.message}`);
    if (!claimed) return;
  } else {
    await supabase
      .from("flow_sessions")
      .update({ waiting_until: null })
      .eq("id", session.id);
  }

  // Get next node after the current one. Interactive messages continue only
  // through the stable handle carried by the selected option.
  const nextEdge = selected?.edge ?? edges.find((e) => e.source === currentNode.id);
  if (!nextEdge) {
    await completeSession(supabase, session.id);
    return;
  }

  const nextNode = nodes.find((n) => n.id === nextEdge.target);
  if (!nextNode) {
    await completeSession(supabase, session.id);
    return;
  }

  await traverseNodes(supabase, session.id, nextNode, nodes, edges, context, 0);
}

async function cancelUnresumableSession(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  reason: string
) {
  console.error(`Cancelling flow session ${sessionId}: ${reason}`);
  const { error } = await supabase
    .from("flow_sessions")
    .update({ status: "cancelled" })
    .eq("id", sessionId);
  if (error) {
    // postgrest swallows network failures into { error }, so an unchecked
    // cancel can silently no-op and strand the session as active forever.
    // current_node_id has not advanced, so FlowLoadError lets callers retry
    // and re-attempt the cancel.
    throw new FlowLoadError(
      `session ${sessionId} could not be cancelled (${reason}): ${error.message}`
    );
  }
}

async function traverseNodes(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  node: FlowNode,
  nodes: FlowNode[],
  edges: FlowEdge[],
  context: FlowExecutionContext,
  depth: number = 0
) {
  if (depth >= MAX_TRAVERSAL_DEPTH) {
    console.error(`Flow traversal exceeded max depth (${MAX_TRAVERSAL_DEPTH}), stopping. Flow: ${context.flowId}`);
    await completeSession(supabase, sessionId);
    return;
  }
  // Update current node
  await supabase
    .from("flow_sessions")
    .update({ current_node_id: node.id })
    .eq("id", sessionId);

  // Track analytics
  await supabase.from("analytics_events").insert({
    workspace_id: context.workspaceId,
    flow_id: context.flowId,
    contact_id: context.contactId,
    event_type: "node_executed",
    metadata: { nodeId: node.id, nodeType: node.type },
  });

  // Execute the node. Private replies need graph context to avoid creating a
  // pointless wait when the node has no continuation.
  const result = await executeNode(
    supabase,
    node,
    context,
    sessionId,
    edges.some((edge) => edge.source === node.id)
  );

  // Persist variables written by output-producing nodes so they survive
  // pauses (resumeSession reloads them from the session row).
  const executedNodeType = getExecutableNodeType(node);
  if (executedNodeType === "aiResponse" || executedNodeType === "httpRequest") {
    await supabase
      .from("flow_sessions")
      .update({ variables: (context.variables ?? {}) as Json })
      .eq("id", sessionId);
  }

  // If the node pauses execution (delay, wait for input, human takeover), stop
  if (result === "pause") return;

  // Find next node(s)
  let nextEdge: FlowEdge | undefined;

  if (result && typeof result === "string" && result.startsWith("handle:")) {
    // Condition/split nodes specify which handle to follow
    const handle = result.replace("handle:", "");
    nextEdge = edges.find(
      (e) => e.source === node.id && e.sourceHandle === handle
    );
  } else {
    nextEdge = edges.find((e) => e.source === node.id);
  }

  if (!nextEdge) {
    await completeSession(supabase, sessionId);
    return;
  }

  const nextNode = nodes.find((n) => n.id === nextEdge!.target);
  if (!nextNode) {
    await completeSession(supabase, sessionId);
    return;
  }

  // Continue to next node
  await traverseNodes(supabase, sessionId, nextNode, nodes, edges, context, depth + 1);
}

function getExecutableNodeType(node: FlowNode): NodeType | undefined {
  if (node.type !== "action") return node.type;
  return (node.data as { actionType?: NodeType }).actionType;
}

async function executeNode(
  supabase: SupabaseClient<Database>,
  node: FlowNode,
  context: FlowExecutionContext,
  sessionId: string,
  hasNextNode: boolean
): Promise<string | void> {
  const nodeType = getExecutableNodeType(node);

  switch (nodeType) {
    case "sendMessage":
      return executeSendMessage(supabase, node, context, sessionId, hasNextNode);
    case "condition":
      return executeCondition(supabase, node.data as ConditionNodeData, context);
    case "delay":
      return executeDelay(supabase, node.data as DelayNodeData, sessionId, node.id, context);
    case "addTag":
    case "removeTag":
      return executeTag(supabase, node.data as TagNodeData, nodeType, context);
    case "setCustomField":
      return executeSetField(supabase, node.data as SetFieldNodeData, context);
    case "httpRequest":
      return executeHttpRequest(node.data as HttpRequestNodeData, context);
    case "goToFlow":
      return executeGoToFlow(supabase, node.data as GoToFlowNodeData, context, sessionId);
    case "humanTakeover":
      return executeHumanTakeover(supabase, context, sessionId);
    case "subscribe":
    case "unsubscribe":
      return executeSubscription(supabase, nodeType, context);
    case "commentReply":
      return executeCommentReply(supabase, node.data as CommentReplyNodeData, context);
    case "privateReply":
      return executePrivateReply(supabase, node.data as PrivateReplyNodeData, context);
    case "aiResponse":
      return executeAiResponse(supabase, node.data as AiResponseNodeData, context, sessionId);
    case "abSplit":
      return executeABSplit(node.data as ABSplitNodeData);
    case "smartDelay":
      return executeSmartDelay(
        supabase,
        node.data as SmartDelayNodeData,
        sessionId,
        node.id,
        context
      );
    case "enrollSequence":
      return executeEnrollSequence(supabase, node.data as EnrollSequenceNodeData, context);
    default:
      return;
  }
}

async function sendFirstMessageAsPrivateReply(
  supabase: SupabaseClient<Database>,
  zernio: ReturnType<typeof createZernioClient>,
  data: SendMessageNodeData,
  context: FlowExecutionContext,
  lateAccountId: string,
  sessionId: string,
  nodeId: string,
  hasNextNode: boolean
) {
  const first = data.messages[0];
  if (!first) {
    throw new Error("Comment flow message node has no message configured");
  }

  const text = interpolateVariables(
    adaptMessage(first, context.platform ?? "instagram").text,
    context.variables || {}
  );
  const configuredOption = first.options?.[0];
  const version = context.publishedVersion ?? 1;
  const button = configuredOption?.kind === "url"
    ? {
        type: "url" as const,
        title: configuredOption.title,
        url: createTrackedLinkUrl(createTrackedLinkToken({
          sessionId,
          flowId: context.flowId,
          version,
          nodeId,
          optionId: configuredOption.id,
          destinationUrl: configuredOption.destinationUrl!,
        })),
      }
    : configuredOption
      ? {
          type: "postback" as const,
          title: configuredOption.title,
          payload: createOptionPayload(context.flowId, version, nodeId, configuredOption.id),
        }
      : undefined;

  try {
    const response = await zernio.comments.sendPrivateReplyToComment({
      path: {
        postId: String(context.variables!.post_id),
        commentId: String(context.variables!.comment_id),
      },
      body: { accountId: lateAccountId, message: text, ...(button ? { buttons: [button] } : {}) },
    });

    if (response.error) {
      throw new Error(`Zernio private reply failed: ${JSON.stringify(response.error)}`);
    }

    await supabase.from("messages").insert({
      conversation_id: context.conversationId,
      direction: "outbound",
      text,
      sent_by_flow_id: context.flowId,
      platform_message_id: response.data?.messageId || null,
      status: "sent",
    });

    await supabase.from("analytics_events").insert({
      workspace_id: context.workspaceId,
      flow_id: context.flowId,
      contact_id: context.contactId,
      event_type: "message_sent",
    });
    if (context.variables) {
      context.variables.comment_dm_sent = "true";
    }
    await supabase
      .from("flow_sessions")
      .update({ variables: (context.variables || {}) as Json })
      .eq("id", sessionId);
    if (configuredOption && hasNextNode) {
      const expiresAt = new Date(Date.now() + (data.interactionTimeoutHours || 24) * 60 * 60 * 1000).toISOString();
      await schedulePrivateReplyExpiration(supabase, sessionId, nodeId, expiresAt, configuredOption.id, version);
    }
  } catch (error) {
    console.error("Failed to send comment-context message as private reply:", error);
    await supabase.from("messages").insert({
      conversation_id: context.conversationId,
      direction: "outbound",
      text,
      sent_by_flow_id: context.flowId,
      status: "failed",
    });
    throw error;
  }

  if (data.messages.length > 1) {
    console.warn(
      "Comment flow Send Message node had multiple messages; only the first was sent (one private reply per comment)."
    );
  }
}

async function schedulePrivateReplyExpiration(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  nodeId: string,
  expiresAt: string,
  optionId: string,
  version: number
) {
  const { error: jobError } = await supabase.from("scheduled_jobs").insert({
    type: "expire_flow_session",
    payload: { sessionId, nodeId, expiresAt },
    run_at: expiresAt,
  });
  if (jobError) throw new Error(`Could not schedule private reply expiration: ${jobError.message}`);
  const { error: sessionError } = await supabase
    .from("flow_sessions")
    .update({
      waiting_for_input: true,
      waiting_until: expiresAt,
      waiting_type: "private_reply",
      waiting_node_id: nodeId,
      wait_expires_at: expiresAt,
      published_version: version,
      accepted_option_ids: [optionId],
      current_node_id: nodeId,
    })
    .eq("id", sessionId);
  if (sessionError) throw new Error(`Could not pause private reply session: ${sessionError.message}`);
}

async function executeSendMessage(
  supabase: SupabaseClient<Database>,
  node: FlowNode,
  context: FlowExecutionContext,
  sessionId: string,
  hasNextNode: boolean
) {
  const data = node.data as SendMessageNodeData;
  // Get workspace for API key
  const { data: workspace } = await supabase
    .from("workspace_integration_credentials")
    .select("late_api_key_encrypted")
    .eq("workspace_id", context.workspaceId)
    .single();

  if (!workspace?.late_api_key_encrypted) return;

  const zernio = createZernioClient(workspace.late_api_key_encrypted);

  // Resolve late_account_id from channel if not in context
  let lateAccountId = context.lateAccountId;
  if (!lateAccountId) {
    const { data: channel } = await supabase
      .from("channels")
      .select("late_account_id, platform")
      .eq("id", context.channelId)
      .single();

    if (!channel) return;
    lateAccountId = channel.late_account_id;
    if (!context.platform) {
      context.platform = channel.platform as FlowExecutionContext["platform"];
    }
  }

  // Resolve late_conversation_id from conversation if not in context
  let lateConversationId = context.lateConversationId;
  if (!lateConversationId) {
    const { data: conversation } = await supabase
      .from("conversations")
      .select("late_conversation_id")
      .eq("id", context.conversationId)
      .single();

    if (!conversation?.late_conversation_id) {
      // Comment-triggered flows have no DM conversation yet. Instagram allows
      // exactly one private reply per comment. After that first private reply,
      // further Send Message nodes must wait for the recipient to answer and
      // create a regular DM conversation instead of retrying the same comment.
      if (context.variables?.comment_dm_sent === "true") {
        return;
      }
      if (context.variables?.comment_id && context.variables?.post_id && lateAccountId) {
        await sendFirstMessageAsPrivateReply(
          supabase,
          zernio,
          data,
          context,
          lateAccountId,
          sessionId,
          node.id,
          hasNextNode
        );
        return hasNextNode && Boolean(data.messages[0]?.options?.[0]) ? "pause" : undefined;
      }
      console.error("No late_conversation_id found for conversation:", context.conversationId);
      return;
    }
    lateConversationId = conversation.late_conversation_id;
  }

  let waitsForOption = false;
  let acceptedOptionIds: string[] = [];
  for (const msg of data.messages) {
    const options = msg.options ?? [];
    const version = context.publishedVersion ?? 1;
    const adapted = adaptMessage(
      msg,
      context.platform!,
      (option) => createOptionPayload(context.flowId, version, node.id, option.id),
      (option) => createTrackedLinkUrl(createTrackedLinkToken({
        sessionId,
        flowId: context.flowId,
        version,
        nodeId: node.id,
        optionId: option.id,
        destinationUrl: option.destinationUrl!,
      }))
    );
    const text = interpolateVariables(adapted.text, context.variables || {});

    try {
      // Media (image/video/audio) is platform-agnostic, so read it from the raw
      // message. `mediaUrl` + `mediaType` supersede the legacy image-only `imageUrl`.
      const rawMsg = msg as { mediaUrl?: string; mediaType?: string; imageUrl?: string };
      const mediaUrl = rawMsg.mediaUrl || rawMsg.imageUrl;
      const mediaType = rawMsg.mediaType || (rawMsg.imageUrl ? "image" : undefined);

      const attachments = mediaUrl
        ? [{ type: mediaType || "image", url: mediaUrl }]
        : undefined;

      // Build the API body with rich messaging fields
      const body: Record<string, unknown> = {
        accountId: lateAccountId,
        message: text,
      };
      // Actually send the media to the recipient. Previously the attachment was only
      // stored locally and never included in the send body, so flow media never
      // reached the contact.
      if (mediaUrl) {
        body.attachmentUrl = mediaUrl;
        body.attachmentType = mediaType || "image";
      }

      if (adapted.buttons?.length) {
        body.buttons = adapted.buttons;
      }
      if (adapted.quickReplies?.length) {
        body.quickReplies = adapted.quickReplies;
      }
      if (adapted.template) {
        body.template = adapted.template;
      }
      if (adapted.replyMarkup) {
        body.replyMarkup = adapted.replyMarkup;
      }

      const response = await zernio.messages.sendInboxMessage({
        path: { conversationId: lateConversationId },
        body: body as Parameters<typeof zernio.messages.sendInboxMessage>[0]["body"],
      });

      // Store outbound message
      await supabase.from("messages").insert({
        conversation_id: context.conversationId,
        direction: "outbound",
        text,
        attachments: attachments || null,
        sent_by_flow_id: context.flowId,
        sent_by_node_id: null,
        platform_message_id: response.data?.data?.messageId || null,
        status: "sent",
      });

      await supabase.from("analytics_events").insert({
        workspace_id: context.workspaceId,
        flow_id: context.flowId,
        contact_id: context.contactId,
        event_type: "message_sent",
      });
      if (options.length > 0) {
        waitsForOption = true;
        acceptedOptionIds = options.map((option) => option.id);
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      await supabase.from("messages").insert({
        conversation_id: context.conversationId,
        direction: "outbound",
        text,
        sent_by_flow_id: context.flowId,
        status: "failed",
      });

      await supabase.from("analytics_events").insert({
        workspace_id: context.workspaceId,
        flow_id: context.flowId,
        contact_id: context.contactId,
        event_type: "message_failed",
        metadata: { error: error instanceof Error ? error.message : "Unknown error" },
      });
    }

    // Small delay between messages
    if (data.messages.length > 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  if (waitsForOption) {
    const expiresAt = new Date(Date.now() + (data.interactionTimeoutHours || 24) * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from("flow_sessions").update({
      waiting_for_input: true,
      waiting_until: expiresAt,
      waiting_type: "message_option",
      waiting_node_id: node.id,
      wait_expires_at: expiresAt,
      published_version: context.publishedVersion ?? 1,
      accepted_option_ids: acceptedOptionIds,
      current_node_id: node.id,
    }).eq("id", sessionId);
    if (error) throw new Error(`Could not pause message option session: ${error.message}`);
    await supabase.from("scheduled_jobs").insert({ type: "expire_flow_session", payload: { sessionId, nodeId: node.id, expiresAt }, run_at: expiresAt });
    return "pause";
  }
}

async function executeCondition(
  supabase: SupabaseClient<Database>,
  data: ConditionNodeData,
  context: FlowExecutionContext
): Promise<string> {
  const { data: contact } = await supabase
    .from("contacts")
    .select("*, contact_tags(tag_id, tags(name)), contact_custom_fields(field_id, value, custom_field_definitions(slug))")
    .eq("id", context.contactId)
    .single();

  if (!contact) return "handle:false";

  const results = data.conditions.map((condition) => {
    let fieldValue: string | undefined;

    // Check built-in fields
    if (condition.field === "platform") {
      fieldValue = context.platform;
    } else if (condition.field === "is_subscribed") {
      fieldValue = String(contact.is_subscribed);
    } else if (condition.field.startsWith("tag:")) {
      const tagName = condition.field.replace("tag:", "");
      const hasTags = Array.isArray(contact.contact_tags);
      const hasTag = hasTags && (contact.contact_tags as Array<{ tags: { name: string } | null }>).some(
        (ct) => ct.tags?.name === tagName
      );
      fieldValue = String(hasTag);
    } else if (condition.field.startsWith("variable:")) {
      const varName = condition.field.replace("variable:", "");
      fieldValue = context.variables?.[varName];
    } else {
      // Check custom fields
      const customFields = contact.contact_custom_fields as Array<{
        value: string;
        custom_field_definitions: { slug: string } | null;
      }> | null;
      const field = customFields?.find(
        (f) => f.custom_field_definitions?.slug === condition.field
      );
      fieldValue = field?.value;
    }

    return evaluateCondition(fieldValue, condition.operator, condition.value);
  });

  const passed =
    data.logic === "and" ? results.every(Boolean) : results.some(Boolean);

  return passed ? "handle:true" : "handle:false";
}

function evaluateCondition(
  actual: string | undefined,
  operator: string,
  expected: string
): boolean {
  switch (operator) {
    case "equals":
      return actual === expected;
    case "not_equals":
      return actual !== expected;
    case "contains":
      return actual?.includes(expected) || false;
    case "exists":
      return actual !== undefined && actual !== null && actual !== "";
    case "gt":
      return Number(actual) > Number(expected);
    case "lt":
      return Number(actual) < Number(expected);
    default:
      return false;
  }
}

const delayMultipliers: Record<DelayNodeData["unit"], number> = {
  seconds: 1000,
  minutes: 60 * 1000,
  hours: 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
};

async function scheduleFlowResume(
  supabase: SupabaseClient<Database>,
  sessionId: string,
  nodeId: string,
  runAt: string,
  waitingForInput: boolean,
  context: FlowExecutionContext
) {
  const { data: job, error: jobError } = await supabase
    .from("scheduled_jobs")
    .insert({
      type: "resume_flow",
      payload: {
        sessionId,
        nodeId,
        flowId: context.flowId,
        channelId: context.channelId,
        contactId: context.contactId,
        conversationId: context.conversationId,
        workspaceId: context.workspaceId,
        lateConversationId: context.lateConversationId || null,
        lateAccountId: context.lateAccountId || null,
        variables: context.variables || {},
        waitUntil: runAt,
      },
      run_at: runAt,
    })
    .select("id")
    .single();

  if (jobError || !job) {
    throw new Error(
      `Could not schedule flow session ${sessionId}: ${jobError?.message || "job was not created"}`
    );
  }

  const { error: sessionError } = await supabase
    .from("flow_sessions")
    .update({
      waiting_for_input: waitingForInput,
      waiting_until: runAt,
      current_node_id: nodeId,
    })
    .eq("id", sessionId);

  if (sessionError) {
    await supabase.from("scheduled_jobs").delete().eq("id", job.id);
    throw new Error(
      `Could not pause flow session ${sessionId}: ${sessionError.message}`
    );
  }
}

const INLINE_DELAY_MAX_MS = 30 * 1000; // 30 segundos máximo para inline
const MIN_DELAY_SECONDS = 5; // Duração mínima recomendada em segundos

async function executeDelay(
  supabase: SupabaseClient<Database>,
  data: DelayNodeData,
  sessionId: string,
  nodeId: string,
  context: FlowExecutionContext
) {
  const configuredTime = data.waitUntil ? Date.parse(data.waitUntil) : NaN;
  const rawDuration = Number.isFinite(data.duration) ? Math.max(0, data.duration) : 0;

  // Se for em segundos e configurado menor que 5s, garante no mínimo 5s
  const duration =
    data.unit === "seconds" && rawDuration > 0
      ? Math.max(MIN_DELAY_SECONDS, rawDuration)
      : rawDuration;

  const delayMs = duration * (delayMultipliers[data.unit] || 1000);
  const effectiveDelayMs = Number.isFinite(configuredTime)
    ? Math.max(0, configuredTime - Date.now())
    : delayMs;

  // Se o atraso for de até 30 segundos, dorme na memória e continua na mesma requisição
  if (effectiveDelayMs <= INLINE_DELAY_MAX_MS) {
    if (effectiveDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, effectiveDelayMs));
    }
    return; // Não retorna "pause", permitindo que traverseNodes siga para o próximo nó
  }

  // Se o atraso for maior que 30 segundos, agenda no banco e pausa a sessão para o Cron
  const runAt = new Date(Date.now() + effectiveDelayMs).toISOString();
  await scheduleFlowResume(supabase, sessionId, nodeId, runAt, false, context);
  return "pause";
}

async function executeSmartDelay(
  supabase: SupabaseClient<Database>,
  data: SmartDelayNodeData,
  sessionId: string,
  nodeId: string,
  context: FlowExecutionContext
) {
  const timeout = Number.isFinite(data.timeout) ? Math.max(1, data.timeout) : 30;
  const unit = data.timeoutUnit || "minutes";
  const runAt = new Date(
    Date.now() + timeout * delayMultipliers[unit]
  ).toISOString();

  await scheduleFlowResume(supabase, sessionId, nodeId, runAt, true, context);
  return "pause";
}

async function executeTag(
  supabase: SupabaseClient<Database>,
  data: TagNodeData,
  nodeType: "addTag" | "removeTag",
  context: FlowExecutionContext
) {
  // Find or create tag
  const { data: tag } = await supabase
    .from("tags")
    .upsert(
      { workspace_id: context.workspaceId, name: data.tagName },
      { onConflict: "workspace_id,name" }
    )
    .select("id")
    .single();

  if (!tag) return;

  const action = data.action ?? (nodeType === "addTag" ? "add" : "remove");
  if (action === "add") {
    await supabase
      .from("contact_tags")
      .upsert({ contact_id: context.contactId, tag_id: tag.id })
      .select();
  } else {
    await supabase
      .from("contact_tags")
      .delete()
      .eq("contact_id", context.contactId)
      .eq("tag_id", tag.id);
  }
}

async function executeSetField(
  supabase: SupabaseClient<Database>,
  data: SetFieldNodeData,
  context: FlowExecutionContext
) {
  if (!data.fieldSlug) {
    console.error("[executeSetField] Field slug is required");
    return;
  }

  const { data: createdFieldDef, error: createFieldError } = await supabase
    .from("custom_field_definitions")
    .upsert(
      {
        workspace_id: context.workspaceId,
        slug: data.fieldSlug,
        name: data.fieldSlug,
        type: "text",
      },
      { onConflict: "workspace_id,slug", ignoreDuplicates: true }
    )
    .select("id")
    .maybeSingle();

  if (createFieldError) {
    console.error("[executeSetField] Failed to ensure field definition", {
      error: createFieldError,
      fieldSlug: data.fieldSlug,
      workspaceId: context.workspaceId,
    });
    return;
  }

  let fieldDef = createdFieldDef;
  if (!fieldDef) {
    const { data: existingFieldDef, error: findFieldError } = await supabase
      .from("custom_field_definitions")
      .select("id")
      .eq("workspace_id", context.workspaceId)
      .eq("slug", data.fieldSlug)
      .single();

    if (findFieldError || !existingFieldDef) {
      console.error("[executeSetField] Failed to find field definition", {
        error: findFieldError,
        fieldSlug: data.fieldSlug,
        workspaceId: context.workspaceId,
      });
      return;
    }

    fieldDef = existingFieldDef;
  }

  const value = interpolateVariables(data.value, context.variables || {});
  const { error: valueError } = await supabase
    .from("contact_custom_fields")
    .upsert(
      {
        contact_id: context.contactId,
        field_id: fieldDef.id,
        value,
      },
      { onConflict: "contact_id,field_id" }
    );

  if (valueError) {
    console.error("[executeSetField] Failed to save contact field value", {
      error: valueError,
      contactId: context.contactId,
      fieldId: fieldDef.id,
    });
  }
}

async function executeHttpRequest(
  data: HttpRequestNodeData,
  context: FlowExecutionContext
) {
  try {
    const url = interpolateVariables(data.url, context.variables || {});
    const body = data.body
      ? interpolateVariables(data.body, context.variables || {})
      : undefined;

    const response = await fetch(url, {
      method: data.method,
      headers: {
        "Content-Type": "application/json",
        ...data.headers,
      },
      body: data.method !== "GET" ? body : undefined,
    });

    const responseData = await response.text();

    // Store response in variable if configured
    if (data.responseVariable && context.variables) {
      try {
        context.variables[data.responseVariable] = JSON.parse(responseData);
      } catch {
        context.variables[data.responseVariable] = responseData;
      }
    }
  } catch (error) {
    console.error("HTTP request failed:", error);
  }
}

async function executeGoToFlow(
  supabase: SupabaseClient<Database>,
  data: GoToFlowNodeData,
  context: FlowExecutionContext,
  _sessionId: string
) {
  // Execute the target flow
  await executeFlow(supabase, {
    ...context,
    flowId: data.flowId,
  });
  // If returnAfter is true, the current flow will continue after the target flow completes
  // For now, we just stop the current traversal
  return "pause";
}

async function executeHumanTakeover(
  supabase: SupabaseClient<Database>,
  context: FlowExecutionContext,
  sessionId: string
) {
  // Pause automation on the conversation
  await supabase
    .from("conversations")
    .update({ is_automation_paused: true })
    .eq("id", context.conversationId);

  // Mark session
  await supabase
    .from("flow_sessions")
    .update({
      human_takeover_at: new Date().toISOString(),
      status: "completed",
    })
    .eq("id", sessionId);

  return "pause";
}

async function executeSubscription(
  supabase: SupabaseClient<Database>,
  action: string,
  context: FlowExecutionContext
) {
  await supabase
    .from("contacts")
    .update({ is_subscribed: action === "subscribe" })
    .eq("id", context.contactId);
}

function executeABSplit(data: ABSplitNodeData): string {
  const totalWeight = data.paths.reduce((sum, p) => sum + p.weight, 0);
  const random = Math.random() * totalWeight;

  let cumulative = 0;
  for (let i = 0; i < data.paths.length; i++) {
    cumulative += data.paths[i].weight;
    if (random <= cumulative) {
      return `handle:${data.paths[i].name}`;
    }
  }

  return `handle:${data.paths[0].name}`;
}

/**
 * Post a public reply to the comment that triggered this flow.
 * Uses the comment_id and post_id variables set by the comment processor.
 */
async function executeCommentReply(
  supabase: SupabaseClient<Database>,
  data: CommentReplyNodeData,
  context: FlowExecutionContext
) {
  const { data: workspace } = await supabase
    .from("workspace_integration_credentials")
    .select("late_api_key_encrypted")
    .eq("workspace_id", context.workspaceId)
    .single();

  if (!workspace?.late_api_key_encrypted) return;

  const zernio = createZernioClient(workspace.late_api_key_encrypted);

  // Resolve late_account_id
  let lateAccountId = context.lateAccountId;
  if (!lateAccountId) {
    const { data: channel } = await supabase
      .from("channels")
      .select("late_account_id")
      .eq("id", context.channelId)
      .single();

    if (!channel) return;
    lateAccountId = channel.late_account_id;
  }

  const commentId = context.variables?.comment_id || context.incomingMessage.sender?.id;
  if (!commentId) return;

  const postId = context.variables?.post_id;
  if (!postId) {
    console.error("No post_id in context variables for commentReply node");
    return;
  }

  const text = interpolateVariables(data.text, context.variables || {});

  try {
    await zernio.comments.replyToInboxPost({
      path: { postId },
      body: { accountId: lateAccountId, message: text, commentId },
    });
  } catch (error) {
    console.error("Failed to post comment reply:", error);
  }
}

/**
 * Send a private DM to the commenter via the Zernio API's private reply endpoint.
 * This creates a DM conversation from a comment context.
 */
async function executePrivateReply(
  supabase: SupabaseClient<Database>,
  data: PrivateReplyNodeData,
  context: FlowExecutionContext
) {
  const { data: workspace } = await supabase
    .from("workspace_integration_credentials")
    .select("late_api_key_encrypted")
    .eq("workspace_id", context.workspaceId)
    .single();

  if (!workspace?.late_api_key_encrypted) return;

  const zernio = createZernioClient(workspace.late_api_key_encrypted);

  // Resolve late_account_id
  let lateAccountId = context.lateAccountId;
  if (!lateAccountId) {
    const { data: channel } = await supabase
      .from("channels")
      .select("late_account_id")
      .eq("id", context.channelId)
      .single();

    if (!channel) return;
    lateAccountId = channel.late_account_id;
  }

  const commentId = context.variables?.comment_id;
  if (!commentId) {
    throw new Error("No comment_id in context variables for privateReply node");
  }

  const postId = context.variables?.post_id;
  if (!postId) {
    throw new Error("No post_id in context variables for privateReply node");
  }

  const text = interpolateVariables(data.text, context.variables || {});

  try {
    const response = await zernio.comments.sendPrivateReplyToComment({
      path: { postId, commentId },
      body: { accountId: lateAccountId, message: text },
    });

    if (response.error) {
      throw new Error(`Zernio private reply failed: ${JSON.stringify(response.error)}`);
    }

    await supabase.from("messages").insert({
      conversation_id: context.conversationId,
      direction: "outbound",
      text,
      attachments: data.imageUrl
        ? [{ type: "image", url: data.imageUrl }]
        : null,
      sent_by_flow_id: context.flowId,
      platform_message_id: response.data?.messageId || null,
      status: "sent",
    });
    if (context.variables) {
      context.variables.comment_dm_sent = "true";
    }
  } catch (error) {
    console.error("Failed to send private reply:", error);
    await supabase.from("messages").insert({
      conversation_id: context.conversationId,
      direction: "outbound",
      text,
      sent_by_flow_id: context.flowId,
      status: "failed",
    });
    throw error;
  }
}

async function completeSession(
  supabase: SupabaseClient<Database>,
  sessionId: string
) {
  // Only an active session can complete: a concurrent cancel (e.g. the cron's
  // stranded-session settle) must not be overwritten to completed. Zero rows
  // matched also skips the flow_completed analytics event below.
  const { data: session } = await supabase
    .from("flow_sessions")
    .update({ status: "completed" })
    .eq("id", sessionId)
    .eq("status", "active")
    .select("flow_id, contact_id, channel_id")
    .single();

  if (session) {
    const { data: flow } = await supabase
      .from("flows")
      .select("workspace_id")
      .eq("id", session.flow_id)
      .single();

    if (flow) {
      await supabase.from("analytics_events").insert({
        workspace_id: flow.workspace_id,
        flow_id: session.flow_id,
        contact_id: session.contact_id,
        event_type: "flow_completed",
      });
    }
  }
}

async function executeEnrollSequence(
  supabase: SupabaseClient<Database>,
  data: EnrollSequenceNodeData,
  context: FlowExecutionContext
) {
  if (!data.sequenceId) {
    console.error("enrollSequence node missing sequenceId");
    return;
  }

  // Verify sequence exists and is active
  const { data: sequence } = await supabase
    .from("sequences")
    .select("id, steps, status")
    .eq("id", data.sequenceId)
    .single();

  if (!sequence || sequence.status !== "active") {
    console.error("Sequence not found or not active:", data.sequenceId);
    return;
  }

  const steps = (sequence.steps as Array<{ type: string; delayMinutes?: number }>) || [];
  if (steps.length === 0) return;

  // Calculate next_step_at based on first step
  let nextStepAt: string;
  const firstStep = steps[0];
  if (firstStep.type === "delay" && firstStep.delayMinutes) {
    nextStepAt = new Date(
      Date.now() + firstStep.delayMinutes * 60 * 1000
    ).toISOString();
  } else {
    nextStepAt = new Date().toISOString();
  }

  // Create enrollment (ignore duplicate errors)
  const { error } = await supabase
    .from("sequence_enrollments")
    .insert({
      sequence_id: data.sequenceId,
      contact_id: context.contactId,
      channel_id: context.channelId,
      next_step_at: nextStepAt,
    });

  if (error && error.code !== "23505") {
    console.error("Failed to enroll contact in sequence:", error);
  }
}

function resolveVariablePath(
  variables: Record<string, unknown>,
  path: string
): unknown {
  let value: unknown = variables;
  for (const key of path.split(".")) {
    if (typeof value !== "object" || value === null) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function interpolateVariables(
  text: string,
  variables: Record<string, unknown>
): string {
  // Supports dot paths ({{myvar.data.name}}) into object variables (e.g. parsed
  // httpRequest JSON responses). Unresolved paths leave the token literal.
  return text.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (token, path: string) => {
    const value = resolveVariablePath(variables, path);
    if (value === null || value === undefined) return token;
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  });
}
