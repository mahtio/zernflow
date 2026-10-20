import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { processBroadcastQueueBatch } from "@/lib/broadcast-queue";

const fetchMock = vi.fn();
const success = () => Response.json({ total: 5, processed: 5, failed: 0 });

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("processBroadcastQueueBatch", () => {
  it("requests a small batch without changing recipients directly", async () => {
    fetchMock.mockResolvedValueOnce(success());
    await expect(processBroadcastQueueBatch()).resolves.toEqual({ total: 5 });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/cron/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 5 }),
    });
  });

  it("recovers from a network failure with backoff", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("NetworkError")).mockResolvedValueOnce(success());
    const result = processBroadcastQueueBatch();
    await vi.runAllTimersAsync();
    await expect(result).resolves.toEqual({ total: 5 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([408, 429, 500, 502, 503, 504])("retries transient HTTP %s", async (status) => {
    fetchMock.mockResolvedValueOnce(new Response("Unavailable", { status })).mockResolvedValueOnce(success());
    const result = processBroadcastQueueBatch();
    await vi.runAllTimersAsync();
    await expect(result).resolves.toEqual({ total: 5 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops after three failed network attempts", async () => {
    fetchMock.mockRejectedValue(new TypeError("NetworkError"));
    const assertion = expect(processBroadcastQueueBatch()).rejects.toThrow("NetworkError");
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry an authentication failure", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: "Unauthorized" }, { status: 401 }));
    await expect(processBroadcastQueueBatch()).rejects.toThrow("Unauthorized");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed successful responses instead of draining indefinitely", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ processed: 5 }));
    await expect(processBroadcastQueueBatch()).rejects.toThrow("Invalid queue response");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
