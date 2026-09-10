import { describe, expect, it } from "vitest";
import {
  messageOptionIssues,
  normalizeMessageOptions,
  optionHandle,
  reachablePathCanSend,
  validateMessageOptionGraph,
} from "./message-options";
import type { FlowEdge, FlowNode, Message } from "./types";

const message = (options: Message["options"], interactionMode: Message["interactionMode"] = "buttons"): Message => ({
  text: "Escolha",
  interactionMode,
  options,
});

describe("message options", () => {
  it("normaliza botões legados com IDs determinísticos", () => {
    const legacy: Message = { buttons: [{ title: "Sim", type: "postback", payload: "YES" }] };
    const first = normalizeMessageOptions(legacy, "node", 0);
    const second = normalizeMessageOptions(legacy, "node", 0);
    expect(first.message.interactionMode).toBe("buttons");
    expect(first.message.options?.[0].id).toBe(second.message.options?.[0].id);
  });

  it("bloqueia formato legado misto", () => {
    expect(normalizeMessageOptions({ buttons: [{ title: "A", type: "postback" }], quickReplies: [{ title: "B", payload: "b" }] }, "node", 0).blocked).toBe(true);
  });

  it("valida limites, títulos e HTTPS", () => {
    expect(messageOptionIssues(message([{ id: "a", title: "", kind: "url", destinationUrl: "javascript:alert(1)" }])).map((issue) => issue.code)).toEqual(["invalid_option_title", "invalid_option_url"]);
    const quickReplies = Array.from({ length: 11 }, (_, index) => ({ id: `q${index}`, title: `Q${index}`, kind: "quick_reply" as const }));
    expect(messageOptionIssues(message(quickReplies, "quick_replies")).some((issue) => issue.code === "too_many_options")).toBe(true);
  });

  it("preserva handle quando apenas o título muda", () => {
    expect(optionHandle("stable")).toBe("option:stable");
  });

  it("detecta envio transitivo em URL → Tag → Mensagem", () => {
    const nodes = [
      { id: "tag", type: "action", data: { actionType: "addTag" }, position: { x: 0, y: 0 } },
      { id: "send", type: "sendMessage", data: { messages: [] }, position: { x: 0, y: 0 } },
    ] as FlowNode[];
    const edges = [{ id: "e", source: "tag", target: "send" }] as FlowEdge[];
    expect(reachablePathCanSend("tag", nodes, edges)).toBe(true);
  });

  it("exige uma saída e rejeita caminho URL capaz de enviar DM", () => {
    const nodes = [
      { id: "choice", type: "sendMessage", data: { messages: [message([{ id: "url", title: "Abrir", kind: "url", destinationUrl: "https://example.com" }])] }, position: { x: 0, y: 0 } },
      { id: "send", type: "sendMessage", data: { messages: [] }, position: { x: 0, y: 0 } },
    ] as FlowNode[];
    const edges = [{ id: "e", source: "choice", sourceHandle: "option:url", target: "send" }] as FlowEdge[];
    expect(validateMessageOptionGraph(nodes, edges).some((issue) => issue.code === "unsafe_message_path")).toBe(true);
  });
});
