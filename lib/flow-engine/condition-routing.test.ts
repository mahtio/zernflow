import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import { simulateFlow } from "./simulator";

const nodes: Node[] = [
  { id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: { triggerType: "comment_keyword", keywords: [{ value: "2027", matchType: "contains" }] } },
  { id: "condition", type: "condition", position: { x: 0, y: 100 }, data: { logic: "and", conditions: [{ field: "current_datetime", operator: "after", value: "2026-10-19T05:00" }] } },
  { id: "new-message", type: "sendMessage", position: { x: 0, y: 200 }, data: { deliveryMode: "private_reply", messages: [{ text: "Cor da Virada", options: [] }] } },
  { id: "old-message", type: "sendMessage", position: { x: 200, y: 200 }, data: { deliveryMode: "private_reply", messages: [{ text: "Entrar no grupo", options: [] }] } },
];
const edges: Edge[] = [
  { id: "a", source: "trigger", target: "condition" },
  { id: "b", source: "condition", sourceHandle: "yes", target: "new-message" },
  { id: "c", source: "condition", sourceHandle: "no", target: "old-message" },
];

describe("comment date condition routing", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it.each([
    ["2026-10-19T10:17:31Z", "new-message", true],
    ["2026-10-19T07:59:59Z", "old-message", false],
    ["2026-10-19T08:00:00Z", "old-message", false],
    ["2026-10-19T08:00:01Z", "new-message", true],
  ])("follows the editor handles at %s", (now, expectedNode, passed) => {
    vi.setSystemTime(new Date(now));
    const result = simulateFlow(nodes, edges, { incomingMessage: "2027" });
    expect(result.errors).toEqual([]);
    expect(result.steps.find((step) => step.nodeId === "condition")?.result).toMatchObject({ type: "condition", result: passed });
    expect(result.steps.filter((step) => step.nodeType === "sendMessage").map((step) => step.nodeId)).toEqual([expectedNode]);
    expect(result.completed).toBe(true);
  });
});
