import { describe, expect, it } from "vitest";
import {
  NO_CONVERSATION_REASON,
  WINDOW_CLOSED_REASON,
  RETRIABLE_REASONS,
  isReplyWindowOpen,
  isWindowClosedError,
} from "@/lib/broadcast-window";

const NOW = Date.parse("2026-06-10T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function windowOpen(platform: string, lastMessageAt: string | null) {
  return isReplyWindowOpen({ platform, lastMessageAt, now: NOW });
}

describe("isReplyWindowOpen", () => {
  it.each(["instagram", "facebook", "whatsapp"])(
    "%s only allows activity strictly within 24 hours",
    (platform) => {
      expect(windowOpen(platform, new Date(NOW - DAY + 1).toISOString())).toBe(true);
      expect(windowOpen(platform, new Date(NOW - DAY).toISOString())).toBe(false);
      expect(windowOpen(platform, new Date(NOW - DAY - 1).toISOString())).toBe(false);
      expect(windowOpen(platform, new Date(NOW).toISOString())).toBe(true);
    }
  );

  it.each(["instagram", "facebook", "whatsapp"])(
    "%s rejects missing or invalid activity timestamps",
    (platform) => {
      expect(windowOpen(platform, null)).toBe(false);
      expect(windowOpen(platform, "")).toBe(false);
      expect(windowOpen(platform, "invalid-date")).toBe(false);
    }
  );

  it.each(["telegram", "twitter", "x", "reddit"])(
    "%s has no 24-hour restriction",
    (platform) => {
      expect(windowOpen(platform, null)).toBe(true);
      expect(windowOpen(platform, "invalid-date")).toBe(true);
      expect(windowOpen(platform, new Date(NOW - 10 * DAY).toISOString())).toBe(true);
    }
  );

  it("compares elapsed time independently of timezone and midnight", () => {
    expect(windowOpen("instagram", "2026-06-09T09:00:00-03:00")).toBe(false);
    expect(windowOpen("instagram", "2026-06-09T09:00:01-03:00")).toBe(true);
    expect(windowOpen("instagram", "2026-06-10T00:01:00Z")).toBe(true);
  });

  it("defaults to the current clock", () => {
    expect(isReplyWindowOpen({
      platform: "instagram",
      lastMessageAt: new Date(Date.now() - 60_000).toISOString(),
    })).toBe(true);
    expect(isReplyWindowOpen({
      platform: "instagram",
      lastMessageAt: new Date(Date.now() - DAY - 60_000).toISOString(),
    })).toBe(false);
  });
});

describe("isWindowClosedError", () => {
  it.each([
    "Meta subcode 2534022",
    "This message is sent outside of allowed window.",
    "Message outside the allowed window",
    "OUTSIDE OF ALLOWED WINDOW",
    'Zernio: {"error":{"code":2534022}}',
  ])("recognizes a confirmed window rejection: %s", (message) => {
    expect(isWindowClosedError(message)).toBe(true);
  });

  it.each(["", "Request timed out", "Unauthorized", "Rate limit exceeded", "Interrupted mid-send; delivery outcome unknown"])(
    "does not make unrelated or uncertain failures retriable: %s",
    (message) => {
      expect(isWindowClosedError(message)).toBe(false);
    }
  );
});

describe("RETRIABLE_REASONS", () => {
  it("only includes unsynced conversations and confirmed closed windows", () => {
    expect(RETRIABLE_REASONS).toEqual([NO_CONVERSATION_REASON, WINDOW_CLOSED_REASON]);
    expect(new Set(RETRIABLE_REASONS).size).toBe(2);
  });
});
