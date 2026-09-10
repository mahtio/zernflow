import type { FlowEdge, FlowNode, SendMessageNodeData } from "./types";

export const COMMENT_PRIVATE_REPLY_TIMEOUT_HOURS = 24;
export const DEFAULT_PRIVATE_REPLY_BUTTON_TITLE = "Continuar";

export interface CommentPrivateReplyIssue {
  code:
    | "multiple_trigger_outputs"
    | "invalid_first_node"
    | "immediate_cycle"
    | "multiple_messages"
    | "invalid_message"
    | "invalid_button"
    | "invalid_destination";
  message: string;
  nodeId?: string;
  triggerId?: string;
}

export interface CommentPrivateReplyNormalization {
  nodes: FlowNode[];
  edges: FlowEdge[];
  changed: boolean;
  migratedNodeIds: string[];
  errors: CommentPrivateReplyIssue[];
}

export function isHttpsDestination(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function createPrivateReplyPostbackPayload(flowId: string, nodeId: string): string {
  return `comment_private_reply:${flowId}:${nodeId}`;
}

export function getCommentPrivateReplyNodeIds(
  nodes: FlowNode[],
  edges: FlowEdge[]
): Set<string> {
  const ids = new Set<string>();
  for (const trigger of nodes) {
    const triggerType = (trigger.data as { triggerType?: string }).triggerType;
    if (trigger.type !== "trigger" || triggerType !== "comment_keyword") continue;
    const outputs = edges.filter((edge) => edge.source === trigger.id);
    if (outputs.length === 1) ids.add(outputs[0].target);
  }
  return ids;
}

function normalizePrivateMessage(
  data: SendMessageNodeData,
  flowId: string,
  nodeId: string
): SendMessageNodeData {
  const source = data.messages?.[0] ?? {};
  const legacyButton = source.buttons?.[0];
  const existing = source.privateReplyButton;
  const type = existing?.type === "url" || existing?.type === "postback"
    ? existing.type
    : legacyButton?.type === "url" || legacyButton?.type === "postback"
      ? legacyButton.type
      : "postback";
  const title = (existing?.title || legacyButton?.title || DEFAULT_PRIVATE_REPLY_BUTTON_TITLE).trim();
  const destinationUrl = existing?.destinationUrl || legacyButton?.url;
  const mediaUrl = source.mediaType === "image"
    ? source.mediaUrl
    : source.imageUrl;

  return {
    ...data,
    deliveryMode: "private_reply",
    interactionTimeoutHours: COMMENT_PRIVATE_REPLY_TIMEOUT_HOURS,
    messages: [{
      text: source.text ?? "",
      mediaUrl,
      mediaType: mediaUrl ? "image" : undefined,
      privateReplyButton: {
        type,
        title: title || DEFAULT_PRIVATE_REPLY_BUTTON_TITLE,
        destinationUrl: type === "url" ? destinationUrl : undefined,
        payload: type === "postback"
          ? createPrivateReplyPostbackPayload(flowId, nodeId)
          : undefined,
      },
    }],
  };
}

export function normalizeCommentPrivateReplies(
  nodes: FlowNode[],
  edges: FlowEdge[],
  flowId: string
): CommentPrivateReplyNormalization {
  const errors: CommentPrivateReplyIssue[] = [];
  const privateNodeIds = new Set<string>();

  for (const trigger of nodes) {
    const triggerType = (trigger.data as { triggerType?: string }).triggerType;
    if (trigger.type !== "trigger" || triggerType !== "comment_keyword") continue;
    const outputs = edges.filter((edge) => edge.source === trigger.id);
    if (outputs.length > 1) {
      errors.push({
        code: "multiple_trigger_outputs",
        triggerId: trigger.id,
        message: "O gatilho de comentário deve ter exatamente uma saída.",
      });
      continue;
    }
    if (outputs.length === 0) continue;
    const first = nodes.find((node) => node.id === outputs[0].target);
    if (!first || first.type !== "sendMessage") {
      errors.push({
        code: "invalid_first_node",
        triggerId: trigger.id,
        nodeId: first?.id,
        message: "A primeira saída do gatilho de comentário deve ser um nó Enviar mensagem.",
      });
      continue;
    }
    if (edges.some((edge) => edge.source === first.id && edge.target === trigger.id)) {
      errors.push({
        code: "immediate_cycle",
        triggerId: trigger.id,
        nodeId: first.id,
        message: "Não é permitido criar um ciclo imediatamente após o gatilho de comentário.",
      });
      continue;
    }
    privateNodeIds.add(first.id);
  }

  const migratedNodeIds: string[] = [];
  const normalizedNodes = nodes.map((node) => {
    if (!privateNodeIds.has(node.id)) return node;
    const data = node.data as SendMessageNodeData;
    if ((data.messages?.length ?? 0) > 1) {
      errors.push({
        code: "multiple_messages",
        nodeId: node.id,
        message: "A resposta privada inicial contém várias mensagens. Separe as mensagens adicionais em nós posteriores antes de publicar.",
      });
    }
    const normalized = normalizePrivateMessage(data, flowId, node.id);
    if (JSON.stringify(normalized) !== JSON.stringify(data)) migratedNodeIds.push(node.id);
    return { ...node, data: normalized };
  });

  for (const node of normalizedNodes) {
    if (!privateNodeIds.has(node.id)) continue;
    const data = node.data as SendMessageNodeData;
    const message = data.messages[0];
    if (!message || (!message.text?.trim() && !message.mediaUrl)) {
      errors.push({ code: "invalid_message", nodeId: node.id, message: "Informe um texto ou uma imagem para a resposta privada." });
    }
    const button = message?.privateReplyButton;
    if (!button || !button.title.trim() || !["postback", "url"].includes(button.type)) {
      errors.push({ code: "invalid_button", nodeId: node.id, message: "Configure um botão válido com texto obrigatório." });
    } else if (button.type === "url" && !isHttpsDestination(button.destinationUrl)) {
      errors.push({ code: "invalid_destination", nodeId: node.id, message: "A URL de destino do botão deve começar com https://." });
    }
  }

  return {
    nodes: normalizedNodes,
    edges,
    changed: migratedNodeIds.length > 0,
    migratedNodeIds,
    errors,
  };
}
