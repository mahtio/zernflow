import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeFlow } from "./engine";
import type { FlowExecutionContext } from "./types";

describe("executeFlow Delay Node (Hybrid Delays)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createMockSupabase(flowData: Record<string, unknown>) {
    const scheduledJobs: Array<Record<string, unknown>> = [];
    const sessionUpdates: Array<Record<string, unknown>> = [];
    const analyticsEvents: Array<Record<string, unknown>> = [];

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "flows") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn((field: string, val: string) => {
              return {
                eq: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({
                  data: flowData,
                  error: null,
                }),
              };
            }),
          };
        }
        if (table === "flow_sessions") {
          return {
            select: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: "session-123", flow_id: "flow-1" },
                  error: null,
                }),
              }),
            }),
            update: vi.fn((updateData: Record<string, unknown>) => {
              sessionUpdates.push(updateData);
              return {
                eq: vi.fn().mockResolvedValue({ error: null }),
              };
            }),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        if (table === "scheduled_jobs") {
          return {
            insert: vi.fn((jobData: Record<string, unknown>) => {
              scheduledJobs.push(jobData);
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: "job-123", ...jobData },
                    error: null,
                  }),
                }),
              };
            }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === "analytics_events") {
          return {
            insert: vi.fn((event: Record<string, unknown>) => {
              analyticsEvents.push(event);
              return Promise.resolve({ error: null });
            }),
          };
        }
        if (table === "channels") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { platform: "instagram", late_account_id: "acc-1" },
              error: null,
            }),
          };
        }
        if (table === "tags") {
          return {
            upsert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: "tag-1" } }),
              }),
            }),
          };
        }
        if (table === "contact_tags") {
          return {
            upsert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          insert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    };

    return { mockSupabase, scheduledJobs, sessionUpdates, analyticsEvents };
  }

  it("executes inline delay (<= 30s) without creating a scheduled_job and traverses to next node", async () => {
    const flowData = {
      id: "flow-1",
      name: "Short Delay Flow",
      status: "published",
      nodes: [
        {
          id: "node-trigger",
          type: "trigger",
          data: { triggerType: "keyword", keywords: [{ value: "test", matchType: "exact" }] },
        },
        {
          id: "node-delay",
          type: "delay",
          data: { duration: 10, unit: "seconds" },
        },
        {
          id: "node-tag",
          type: "addTag",
          data: { tagName: "delayed_lead" },
        },
      ],
      edges: [
        { id: "e1", source: "node-trigger", target: "node-delay" },
        { id: "e2", source: "node-delay", target: "node-tag" },
      ],
    };

    const { mockSupabase, scheduledJobs, sessionUpdates } = createMockSupabase(flowData);

    const context: FlowExecutionContext = {
      flowId: "flow-1",
      triggerId: "trig-1",
      conversationId: "conv-1",
      contactId: "contact-1",
      workspaceId: "ws-1",
      channelId: "ch-1",
      incomingMessage: { text: "test" },
    };

    const promise = executeFlow(mockSupabase as any, context);

    // Fast-forward 10 seconds for inline delay
    await vi.advanceTimersByTimeAsync(10_000);
    await promise;

    // Scheduled jobs should NOT be created for inline delay
    expect(scheduledJobs).toHaveLength(0);

    // Session should have been completed (status: "completed") after reaching node-tag
    expect(sessionUpdates.some((u) => u.status === "completed")).toBe(true);
  });

  it("schedules a job for long delay (> 30s) and pauses the session", async () => {
    const flowData = {
      id: "flow-1",
      name: "Long Delay Flow",
      status: "published",
      nodes: [
        {
          id: "node-trigger",
          type: "trigger",
          data: { triggerType: "keyword", keywords: [{ value: "test", matchType: "exact" }] },
        },
        {
          id: "node-delay",
          type: "delay",
          data: { duration: 5, unit: "minutes" },
        },
        {
          id: "node-tag",
          type: "addTag",
          data: { tagName: "delayed_lead" },
        },
      ],
      edges: [
        { id: "e1", source: "node-trigger", target: "node-delay" },
        { id: "e2", source: "node-delay", target: "node-tag" },
      ],
    };

    const { mockSupabase, scheduledJobs, sessionUpdates } = createMockSupabase(flowData);

    const context: FlowExecutionContext = {
      flowId: "flow-1",
      triggerId: "trig-1",
      conversationId: "conv-1",
      contactId: "contact-1",
      workspaceId: "ws-1",
      channelId: "ch-1",
      incomingMessage: { text: "test" },
    };

    await executeFlow(mockSupabase as any, context);

    // A scheduled job MUST be created for 5 minutes
    expect(scheduledJobs).toHaveLength(1);
    expect(scheduledJobs[0].job_type).toBe("flow_resume");
    expect(scheduledJobs[0].status).toBe("pending");

    // Session must be paused with waiting_until set
    const pauseUpdate = sessionUpdates.find((u) => u.waiting_until !== undefined && u.waiting_until !== null);
    expect(pauseUpdate).toBeDefined();
    expect(pauseUpdate?.waiting_for_input).toBe(false);
  });

  it("enforces minimum 5 seconds for seconds-based delay", async () => {
    const flowData = {
      id: "flow-1",
      name: "Min Delay Flow",
      status: "published",
      nodes: [
        {
          id: "node-trigger",
          type: "trigger",
          data: { triggerType: "keyword", keywords: [{ value: "test", matchType: "exact" }] },
        },
        {
          id: "node-delay",
          type: "delay",
          data: { duration: 1, unit: "seconds" }, // Configured as 1s, should be enforced to 5s
        },
      ],
      edges: [{ id: "e1", source: "node-trigger", target: "node-delay" }],
    };

    const { mockSupabase, scheduledJobs } = createMockSupabase(flowData);

    const context: FlowExecutionContext = {
      flowId: "flow-1",
      triggerId: "trig-1",
      conversationId: "conv-1",
      contactId: "contact-1",
      workspaceId: "ws-1",
      channelId: "ch-1",
      incomingMessage: { text: "test" },
    };

    const promise = executeFlow(mockSupabase as any, context);

    // Advancing 3s should still be running
    await vi.advanceTimersByTimeAsync(3_000);
    // Advancing 2s more (total 5s) completes
    await vi.advanceTimersByTimeAsync(2_000);
    await promise;

    expect(scheduledJobs).toHaveLength(0);
  });
});
