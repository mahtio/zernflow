import { describe, expect, it } from "vitest";
import { normalizeCommentPrivateReplies, shouldSendCommentPrivateReply } from "./comment-private-reply";
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
        interactionMode: "buttons",
        options: [{
          id: "opt_private_first-message",
          kind: "postback",
          title: "Continuar",
        }],
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
    expect((valid.nodes[1].data as any).messages[0].options[0].destinationUrl).toBe("https://example.com/oferta");

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

  it("normaliza a primeira mensagem de cada ramo após condições sem alterar mensagens posteriores", () => {
    const condition: FlowNode = { id: "condition", type: "condition", position: { x: 0, y: 50 }, data: { conditions: [{ field: "current_datetime", operator: "after", value: "2026-10-19T05:00" }], logic: "and" } };
    const nested = { ...condition, id: "nested" };
    const alternative = { ...message, id: "alternative" };
    const later = { ...message, id: "later" };
    const edges: FlowEdge[] = [
      { id: "a", source: trigger.id, target: condition.id },
      { id: "b", source: condition.id, sourceHandle: "true", target: message.id },
      { id: "c", source: condition.id, sourceHandle: "false", target: nested.id },
      { id: "d", source: nested.id, sourceHandle: "true", target: alternative.id },
      { id: "e", source: message.id, sourceHandle: "option:opt_private_first-message", target: later.id },
    ];
    const result = normalizeCommentPrivateReplies([trigger, condition, nested, message, alternative, later], edges, "flow-1");
    expect(result.errors).toEqual([]);
    expect(result.migratedNodeIds).toEqual([message.id, alternative.id]);
    expect(result.nodes.find((node) => node.id === later.id)?.data).toEqual(later.data);
    expect(normalizeCommentPrivateReplies(result.nodes, edges, "flow-1").changed).toBe(false);
  });

  it("permite ramos convergentes e detecta ciclos entre condições", () => {
    const condition: FlowNode = { id: "condition", type: "condition", position: { x: 0, y: 50 }, data: { conditions: [], logic: "and" } };
    const edges: FlowEdge[] = [
      { id: "a", source: trigger.id, target: condition.id },
      { id: "b", source: condition.id, sourceHandle: "true", target: message.id },
      { id: "c", source: condition.id, sourceHandle: "false", target: message.id },
    ];
    expect(normalizeCommentPrivateReplies([trigger, condition, message], edges, "flow-1").errors).toEqual([]);
    const cyclic = [...edges, { id: "cycle", source: condition.id, target: condition.id }];
    expect(normalizeCommentPrivateReplies([trigger, condition, message], cyclic, "flow-1").errors.some((issue) => issue.code === "immediate_cycle")).toBe(true);
  });

  it("mantém as restrições da resposta privada nos ramos de uma condição", () => {
    const condition: FlowNode = { id: "condition", type: "condition", position: { x: 0, y: 50 }, data: { conditions: [], logic: "and" } };
    const multiple = { ...message, data: { messages: [{ text: "Primeira" }, { text: "Segunda" }] } };
    const result = normalizeCommentPrivateReplies([trigger, condition, multiple], [
      { id: "a", source: trigger.id, target: condition.id },
      { id: "b", source: condition.id, sourceHandle: "true", target: message.id },
    ], "flow-1");
    expect(result.errors.some((issue) => issue.code === "multiple_messages")).toBe(true);
  });

  it("prioriza a resposta privada de um comentário novo", () => {
    expect(shouldSendCommentPrivateReply(
      { deliveryMode: "private_reply" },
      { comment_id: "comment-2", post_id: "post-1", comment_dm_sent: "false" }
    )).toBe(true);
    expect(shouldSendCommentPrivateReply(
      { deliveryMode: "private_reply" },
      { comment_id: "comment-2", post_id: "post-1", comment_dm_sent: "true" }
    )).toBe(false);
    expect(shouldSendCommentPrivateReply(
      { deliveryMode: "standard" },
      { comment_id: "comment-2", post_id: "post-1", comment_dm_sent: "false" }
    )).toBe(false);
  });
});
