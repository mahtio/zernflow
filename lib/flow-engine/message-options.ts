import type {
  FlowEdge,
  FlowNode,
  Message,
  MessageInteractionMode,
  MessageOption,
  SendMessageNodeData,
} from "./types";

export const MAX_MESSAGE_BUTTONS = 3;
export const MAX_QUICK_REPLIES = 10;
export const MAX_OPTION_TITLE_LENGTH = 20;

export interface MessageOptionIssue {
  code:
    | "mixed_legacy_options"
    | "invalid_mode"
    | "invalid_option_kind"
    | "invalid_option_title"
    | "invalid_option_url"
    | "too_many_options"
    | "duplicate_option_id"
    | "missing_option_edge"
    | "multiple_option_edges"
    | "unsafe_message_path";
  message: string;
  nodeId?: string;
  optionId?: string;
}

function stableLegacyId(nodeId: string, messageIndex: number, kind: string, index: number, seed: string): string {
  let hash = 2166136261;
  const value = `${nodeId}:${messageIndex}:${kind}:${index}:${seed}`;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `opt_${(hash >>> 0).toString(36)}`;
}

export function createMessageOptionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `opt_${crypto.randomUUID().replaceAll("-", "")}`;
  }
  return `opt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function optionHandle(optionId: string): string {
  return `option:${optionId}`;
}

export function optionIdFromHandle(handle: string | null | undefined): string | null {
  return handle?.startsWith("option:") ? handle.slice(7) || null : null;
}

export function isHttpsOptionUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function normalizeMessageOptions(
  message: Message,
  nodeId: string,
  messageIndex: number
): { message: Message; changed: boolean; blocked: boolean } {
  const legacyButtons = message.buttons ?? [];
  const legacyReplies = message.quickReplies ?? [];
  const blocked = legacyButtons.length > 0 && legacyReplies.length > 0;
  if (blocked) return { message, changed: false, blocked: true };

  if (message.interactionMode && message.options) {
    return { message, changed: false, blocked: false };
  }

  let interactionMode: MessageInteractionMode = "none";
  let options: MessageOption[] = [];
  if (legacyButtons.length) {
    interactionMode = "buttons";
    options = legacyButtons.map((button, index) => ({
      id: stableLegacyId(nodeId, messageIndex, button.type, index, button.payload || button.url || button.title),
      title: button.title,
      kind: button.type,
      destinationUrl: button.type === "url" ? button.url : undefined,
      legacyPayload: button.payload,
    }));
  } else if (legacyReplies.length) {
    interactionMode = "quick_replies";
    options = legacyReplies.map((reply, index) => ({
      id: stableLegacyId(nodeId, messageIndex, "quick_reply", index, reply.payload || reply.title),
      title: reply.title,
      kind: "quick_reply",
      legacyPayload: reply.payload,
    }));
  }

  const { buttons: _buttons, quickReplies: _quickReplies, ...rest } = message;
  return {
    message: { ...rest, interactionMode, options },
    changed: true,
    blocked: false,
  };
}

export function normalizeFlowMessageOptions(nodes: FlowNode[]): {
  nodes: FlowNode[];
  changed: boolean;
  issues: MessageOptionIssue[];
} {
  let changed = false;
  const issues: MessageOptionIssue[] = [];
  const normalized = nodes.map((node) => {
    if (node.type !== "sendMessage") return node;
    const data = node.data as SendMessageNodeData;
    const messages = (data.messages ?? []).map((message, index) => {
      const result = normalizeMessageOptions(message, node.id, index);
      changed ||= result.changed;
      if (result.blocked) {
        issues.push({
          code: "mixed_legacy_options",
          nodeId: node.id,
          message: "A mensagem contém botões e respostas rápidas legados ao mesmo tempo. Escolha um único modo.",
        });
      }
      return result.message;
    });
    return { ...node, data: { ...data, messages } };
  });
  return { nodes: normalized, changed, issues };
}

export function messageOptionIssues(message: Message, nodeId?: string): MessageOptionIssue[] {
  const issues: MessageOptionIssue[] = [];
  const mode = message.interactionMode ?? "none";
  const options = message.options ?? [];
  if (!(["none", "buttons", "quick_replies"] as string[]).includes(mode)) {
    issues.push({ code: "invalid_mode", nodeId, message: "Selecione um modo de interação válido." });
    return issues;
  }
  const max = mode === "buttons" ? MAX_MESSAGE_BUTTONS : mode === "quick_replies" ? MAX_QUICK_REPLIES : 0;
  if (options.length > max) {
    issues.push({ code: "too_many_options", nodeId, message: `Este modo aceita no máximo ${max} opções.` });
  }
  const ids = new Set<string>();
  for (const option of options) {
    if (!option.id || ids.has(option.id)) {
      issues.push({ code: "duplicate_option_id", nodeId, optionId: option.id, message: "Cada opção deve possuir um identificador interno exclusivo." });
    }
    ids.add(option.id);
    const allowed = mode === "buttons"
      ? option.kind === "postback" || option.kind === "url"
      : mode === "quick_replies" && option.kind === "quick_reply";
    if (!allowed) {
      issues.push({ code: "invalid_option_kind", nodeId, optionId: option.id, message: "O tipo da opção não corresponde ao modo da mensagem." });
    }
    if (!option.title.trim() || option.title.length > MAX_OPTION_TITLE_LENGTH) {
      issues.push({ code: "invalid_option_title", nodeId, optionId: option.id, message: "O texto da opção deve ter entre 1 e 20 caracteres." });
    }
    if (option.kind === "url" && !isHttpsOptionUrl(option.destinationUrl)) {
      issues.push({ code: "invalid_option_url", nodeId, optionId: option.id, message: "Botões de página exigem uma URL HTTPS válida." });
    }
  }
  return issues;
}

export function findMessageOption(data: SendMessageNodeData, optionId: string): MessageOption | undefined {
  return data.messages.flatMap((message) => message.options ?? []).find((option) => option.id === optionId);
}

export function nodeCanSendDirectly(node: FlowNode): boolean {
  if (node.type === "sendMessage" || node.type === "privateReply") return true;
  if (node.type === "aiResponse") return (node.data as { sendDirectly?: boolean }).sendDirectly !== false;
  if (node.type === "action") {
    const data = node.data as { actionType?: string; sendDirectly?: boolean };
    return data.actionType === "privateReply" || data.actionType === "sendMessage" ||
      (data.actionType === "aiResponse" && data.sendDirectly !== false);
  }
  return false;
}

export function reachablePathCanSend(startNodeId: string, nodes: FlowNode[], edges: FlowEdge[]): boolean {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visited = new Set<string>();
  const pending = [startNodeId];
  while (pending.length) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = byId.get(id);
    if (!node) continue;
    if (nodeCanSendDirectly(node)) return true;
    for (const edge of edges) if (edge.source === id) pending.push(edge.target);
  }
  return false;
}

export function validateMessageOptionGraph(nodes: FlowNode[], edges: FlowEdge[]): MessageOptionIssue[] {
  const issues: MessageOptionIssue[] = [];
  for (const node of nodes) {
    if (node.type !== "sendMessage") continue;
    const data = node.data as SendMessageNodeData;
    const options = data.messages.flatMap((message) => message.options ?? []);
    for (const message of data.messages) issues.push(...messageOptionIssues(message, node.id));
    for (const option of options) {
      const outgoing = edges.filter((edge) => edge.source === node.id && edge.sourceHandle === optionHandle(option.id));
      if (outgoing.length === 0) {
        issues.push({ code: "missing_option_edge", nodeId: node.id, optionId: option.id, message: `A opção “${option.title}” precisa de um destino.` });
      } else if (outgoing.length > 1) {
        issues.push({ code: "multiple_option_edges", nodeId: node.id, optionId: option.id, message: `A opção “${option.title}” aceita somente uma conexão.` });
      }
      if (option.kind === "url" && outgoing.some((edge) => reachablePathCanSend(edge.target, nodes, edges))) {
        issues.push({ code: "unsafe_message_path", nodeId: node.id, optionId: option.id, message: `O caminho do link “${option.title}” não pode alcançar um envio de mensagem.` });
      }
    }
    if (data.deliveryMode === "private_reply") {
      const first = data.messages[0];
      const privateOptions = first?.options ?? [];
      const safeOnly = privateOptions.length === 0 || privateOptions[0]?.kind === "url";
      if (safeOnly) {
        const allowedHandles = new Set(privateOptions.map((option) => optionHandle(option.id)));
        const outgoing = edges.filter((edge) => edge.source === node.id && (allowedHandles.size === 0 || allowedHandles.has(edge.sourceHandle ?? "")));
        if (outgoing.some((edge) => reachablePathCanSend(edge.target, nodes, edges))) {
          issues.push({ code: "unsafe_message_path", nodeId: node.id, message: "Sem postback, a resposta privada só pode continuar por Lógica/Ações sem envio de DM." });
        }
      }
    }
  }
  return issues;
}
