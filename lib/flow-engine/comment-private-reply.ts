import type { FlowEdge, FlowNode, FlowVariables, MessageOption, SendMessageNodeData } from "./types";
import { isHttpsOptionUrl, optionHandle, reachablePathCanSend } from "./message-options";

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

export function shouldSendCommentPrivateReply(
  data: Pick<SendMessageNodeData, "deliveryMode">,
  variables?: FlowVariables
): boolean {
  return data.deliveryMode === "private_reply"
    && Boolean(variables?.comment_id)
    && Boolean(variables?.post_id)
    && variables?.comment_dm_sent !== "true";
}

export interface CommentPrivateReplyNormalization {
  nodes: FlowNode[];
  edges: FlowEdge[];
  changed: boolean;
  migratedNodeIds: string[];
  errors: CommentPrivateReplyIssue[];
}

export const isHttpsDestination = isHttpsOptionUrl;

export function createPrivateReplyPostbackPayload(flowId: string, nodeId: string, optionId = "continue"): string {
  return `flow_option:${flowId}:${nodeId}:${optionId}`;
}

function findCommentPrivateReplies(nodes: FlowNode[], edges: FlowEdge[]) {
  const ids = new Set<string>();
  const errors: CommentPrivateReplyIssue[] = [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  for (const trigger of nodes) {
    const triggerType = (trigger.data as { triggerType?: string }).triggerType;
    if (trigger.type !== "trigger" || triggerType !== "comment_keyword") continue;
    const outputs = edges.filter((edge) => edge.source === trigger.id);
    if (outputs.length > 1) {
      errors.push({ code: "multiple_trigger_outputs", triggerId: trigger.id, message: "O gatilho de comentário deve ter exatamente uma saída." });
      continue;
    }
    const visited = new Set<string>();
    const active = new Set<string>([trigger.id]);
    const visit = (nodeId: string) => {
      if (active.has(nodeId)) {
        errors.push({ code: "immediate_cycle", triggerId: trigger.id, nodeId, message: "Não é permitido criar um ciclo antes da resposta privada do comentário." });
        return;
      }
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      const node = nodeById.get(nodeId);
      if (node?.type === "sendMessage") {
        ids.add(node.id);
        if (edges.some((edge) => edge.source === node.id && (edge.target === trigger.id || active.has(edge.target)))) {
          errors.push({ code: "immediate_cycle", triggerId: trigger.id, nodeId, message: "Não é permitido criar um ciclo imediatamente após o gatilho de comentário." });
        }
        return;
      }
      if (node?.type !== "condition") {
        errors.push({ code: "invalid_first_node", triggerId: trigger.id, nodeId, message: "Antes da primeira mensagem de um comentário, use somente nós de Condição. A primeira mensagem será uma resposta privada." });
        return;
      }
      active.add(nodeId);
      for (const edge of edges.filter((edge) => edge.source === nodeId)) visit(edge.target);
      active.delete(nodeId);
    };
    for (const output of outputs) visit(output.target);
  }
  return { ids, errors };
}

export function getCommentPrivateReplyNodeIds(
  nodes: FlowNode[],
  edges: FlowEdge[]
): Set<string> {
  return findCommentPrivateReplies(nodes, edges).ids;
}

function normalizePrivateMessage(
  data: SendMessageNodeData,
  flowId: string,
  nodeId: string
): SendMessageNodeData {
  const source = data.messages?.[0] ?? {};
  const legacyButton = source.buttons?.[0];
  const existing = source.privateReplyButton;
  const canonical = source.options?.[0];
  const type = canonical?.kind === "url" || canonical?.kind === "postback"
    ? canonical.kind
    : existing?.type === "url" || existing?.type === "postback"
      ? existing.type
      : legacyButton?.type === "url" || legacyButton?.type === "postback"
        ? legacyButton.type
        : source.interactionMode === "none"
          ? undefined
          : "postback";
  const title = (canonical?.title || existing?.title || legacyButton?.title || DEFAULT_PRIVATE_REPLY_BUTTON_TITLE).trim();
  const destinationUrl = canonical?.destinationUrl || existing?.destinationUrl || legacyButton?.url;
  const mediaUrl = source.mediaType === "image" ? source.mediaUrl : source.imageUrl;
  const option: MessageOption | undefined = type ? {
    id: canonical?.id || existing?.id || `opt_private_${nodeId}`,
    title: title || DEFAULT_PRIVATE_REPLY_BUTTON_TITLE,
    kind: type,
    destinationUrl: type === "url" ? destinationUrl : undefined,
  } : undefined;

  return {
    ...data,
    deliveryMode: "private_reply",
    interactionTimeoutHours: COMMENT_PRIVATE_REPLY_TIMEOUT_HOURS,
    messages: [{
      text: source.text ?? "",
      mediaUrl,
      mediaType: mediaUrl ? "image" : undefined,
      interactionMode: option ? "buttons" : "none",
      options: option ? [option] : [],
    }],
  };
}

export function normalizeCommentPrivateReplies(
  nodes: FlowNode[],
  edges: FlowEdge[],
  flowId: string
): CommentPrivateReplyNormalization {
  const { ids: privateNodeIds, errors } = findCommentPrivateReplies(nodes, edges);

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
    const options = message?.options ?? [];
    if (options.length > 1 || options.some((option) => option.kind === "quick_reply")) {
      errors.push({ code: "invalid_button", nodeId: node.id, message: "A resposta privada aceita zero ou um botão, sem respostas rápidas." });
    }
    const button = options[0];
    if (button && (!button.title.trim() || !["postback", "url"].includes(button.kind))) {
      errors.push({ code: "invalid_button", nodeId: node.id, message: "Configure um botão válido com texto obrigatório." });
    } else if (button?.kind === "url" && !isHttpsDestination(button.destinationUrl)) {
      errors.push({ code: "invalid_destination", nodeId: node.id, message: "A URL de destino do botão deve começar com https://." });
    }
    const outgoing = edges.filter((edge) => edge.source === node.id && (!button || edge.sourceHandle === optionHandle(button.id)));
    if ((!button || button.kind === "url") && outgoing.some((edge) => reachablePathCanSend(edge.target, normalizedNodes, edges))) {
      errors.push({ code: "invalid_destination", nodeId: node.id, message: "Sem postback, a resposta privada só pode alcançar Lógica/Ações que não enviem mensagens." });
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
