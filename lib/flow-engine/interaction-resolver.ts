import type { FlowEdge, FlowNode, MessageOption, SendMessageNodeData } from "./types";
import { findMessageOption, optionHandle } from "./message-options";

export type InteractionType = "postback" | "quick_reply" | "link" | "message" | "reaction";

export interface ParsedOptionPayload {
  flowId: string;
  version: number;
  nodeId: string;
  optionId: string;
}

export function createOptionPayload(flowId: string, version: number, nodeId: string, optionId: string): string {
  return `flow_option:${flowId}:${version}:${nodeId}:${optionId}`;
}

export function parseOptionPayload(payload: string | undefined): ParsedOptionPayload | null {
  if (!payload?.startsWith("flow_option:")) return null;
  const parts = payload.split(":");
  if (parts.length !== 5) return null;
  const version = Number(parts[2]);
  if (!parts[1] || !Number.isInteger(version) || version < 1 || !parts[3] || !parts[4]) return null;
  return { flowId: parts[1], version, nodeId: parts[3], optionId: parts[4] };
}

export function resolveOptionEdge(
  node: FlowNode,
  edges: FlowEdge[],
  optionId: string
): { option: MessageOption; edge: FlowEdge } | null {
  if (node.type !== "sendMessage") return null;
  const option = findMessageOption(node.data as SendMessageNodeData, optionId);
  if (!option) return null;
  const matches = edges.filter((edge) => edge.source === node.id && edge.sourceHandle === optionHandle(option.id));
  return matches.length === 1 ? { option, edge: matches[0] } : null;
}

export function classifyInboundInteraction(input: {
  postbackPayload?: string;
  quickReplyPayload?: string;
  linkToken?: string;
  text?: string;
  reaction?: string;
}): InteractionType {
  if (input.postbackPayload) return "postback";
  if (input.quickReplyPayload) return "quick_reply";
  if (input.linkToken) return "link";
  if (input.reaction) return "reaction";
  return "message";
}

export function chooseDeterministicTrigger<T extends { priority?: number | null; id: string }>(matches: T[]): T | null {
  return [...matches].sort((a, b) => {
    const priority = (b.priority ?? 0) - (a.priority ?? 0);
    if (priority !== 0) return priority;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0] ?? null;
}
