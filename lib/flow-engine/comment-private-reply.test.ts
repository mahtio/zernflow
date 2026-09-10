import { describe, expect, it } from "vitest";
import { normalizeCommentPrivateReplies } from "./comment-private-reply";
import type { FlowEdge, FlowNode } from "./types";

const trigger: FlowNode = {
  id: "trigger-09-09",
  type: "trigger",
  position: { x: 0, y: 0 },
  data: { triggerType: "comment_keyword", keywords: [{ value: "09/09", matchType: "exact" }] },
};
const message: FlowNode = {
  id: "first-message",
  type: "sendMessage",
  position: { x: 0, y: 100 },
  data: { messages: [{ text: "Olá", imageUrl: "https://example.com/welcome.png" }] },
};
const edge: FlowEdge = { id: "e1", source: trigger.id, target: message.id };

describe("normalizeCommentPrivateReplies", () => {
  it("migra de forma idempotente e preserva texto, imagem e 09/09 literal", () => {
    const first = normalizeCommentPrivateReplies([trigger, message], [edge], "flow-1");
    expect(first.errors).toEqual([]);
    expect(first.changed).toBe(true);
    expect(first.nodes[0].data).toEqual(trigger.data);
    expect(first.nodes[1].data).toMatchObject({
      deliveryMode: "private_reply",
      interactionTimeoutHours: 24,
      messages: [{
        text: "Olá",
        mediaUrl: "https://example.com/welcome.png",
        mediaType: "image",
        privateReplyButton: {
          type: "postback",
          title: "Continuar",
          payload: "comment_private_reply:flow-1:first-message",
        },
      }],
    });
    const second = normalizeCommentPrivateReplies(first.nodes, first.edges, "flow-1");
    expect(second.changed).toBe(false);
  });

  it("rejeita primeiro nó incompatível e múltiplas saídas", () => {
    const delay: FlowNode = { id: "delay", type: "delay", position: { x: 0, y: 100 }, data: { duration: 5, unit: "seconds" } };
    const result = normalizeCommentPrivateReplies(
      [trigger, delay, message],
      [edge, { id: "e2", source: trigger.id, target: delay.id }],
      "flow-1"
    );
    expect(result.errors[0].code).toBe("multiple_trigger_outputs");

    const invalid = normalizeCommentPrivateReplies([trigger, delay], [{ ...edge, target: delay.id }], "flow-1");
    expect(invalid.errors[0].code).toBe("invalid_first_node");
  });

  it("valida URL HTTPS e mantém botão URL válido", () => {
    const urlNode: FlowNode = {
      ...message,
      data: { messages: [{ text: "Abra", buttons: [{ type: "url", title: "Ver", url: "https://example.com/oferta" }] }] },
    };
    const valid = normalizeCommentPrivateReplies([trigger, urlNode], [edge], "flow-1");
    expect(valid.errors).toEqual([]);
    expect((valid.nodes[1].data as any).messages[0].privateReplyButton.destinationUrl).toBe("https://example.com/oferta");

    const unsafe: FlowNode = {
      ...urlNode,
      data: { messages: [{ text: "Abra", buttons: [{ type: "url", title: "Ver", url: "javascript:alert(1)" }] }] },
    };
    expect(normalizeCommentPrivateReplies([trigger, unsafe], [edge], "flow-1").errors[0].code).toBe("invalid_destination");
  });

  it("bloqueia várias mensagens antigas para impedir perda silenciosa", () => {
    const multiple: FlowNode = { ...message, data: { messages: [{ text: "Primeira" }, { text: "Segunda" }] } };
    const result = normalizeCommentPrivateReplies([trigger, multiple], [edge], "flow-1");
    expect(result.errors.some((issue) => issue.code === "multiple_messages")).toBe(true);
    expect((result.nodes[1].data as any).messages).toHaveLength(1);
  });
});
