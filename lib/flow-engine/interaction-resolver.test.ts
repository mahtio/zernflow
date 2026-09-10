import { describe, expect, it } from "vitest";
import { chooseDeterministicTrigger, classifyInboundInteraction, createOptionPayload, parseOptionPayload, resolveOptionEdge } from "./interaction-resolver";
import type { FlowEdge, FlowNode } from "./types";

describe("interaction resolver", () => {
  it("codifica e resolve a identidade publicada da opção", () => {
    const payload = createOptionPayload("flow", 4, "node", "option");
    expect(parseOptionPayload(payload)).toEqual({ flowId: "flow", version: 4, nodeId: "node", optionId: "option" });
    expect(parseOptionPayload("flow_option:broken")).toBeNull();
  });

  it("prioriza postback, resposta rápida e link", () => {
    expect(classifyInboundInteraction({ text: "x", postbackPayload: "p" })).toBe("postback");
    expect(classifyInboundInteraction({ quickReplyPayload: "q" })).toBe("quick_reply");
    expect(classifyInboundInteraction({ linkToken: "l" })).toBe("link");
  });

  it("seleciona somente a aresta do ID estável", () => {
    const node = { id: "node", type: "sendMessage", position: { x: 0, y: 0 }, data: { messages: [{ interactionMode: "buttons", options: [{ id: "a", title: "Mesmo", kind: "postback" }, { id: "b", title: "Mesmo", kind: "postback" }] }] } } as FlowNode;
    const edges = [{ id: "ea", source: "node", sourceHandle: "option:a", target: "A" }, { id: "eb", source: "node", sourceHandle: "option:b", target: "B" }] as FlowEdge[];
    expect(resolveOptionEdge(node, edges, "b")?.edge.target).toBe("B");
  });

  it("desempata gatilhos de forma estável", () => {
    expect(chooseDeterministicTrigger([{ id: "z", priority: 1 }, { id: "a", priority: 1 }])?.id).toBe("a");
    expect(chooseDeterministicTrigger([{ id: "a", priority: 1 }, { id: "z", priority: 2 }])?.id).toBe("z");
  });
});
