/**
 * Shared vocabulary for the two broadcast failures that are *not* permanent.
 *
 * A failed recipient is never picked up again by the queue worker, so the
 * retry route is the only way back. It matches on these exact strings, which
 * is why the worker must record them verbatim instead of a free-form message.
 */

/** Recorded when the contact has no Zernio conversation yet. */
export const NO_CONVERSATION_REASON =
  "No synced conversation for this contact on this channel";

/** Recorded when the platform's reply window has closed for the contact. */
export const WINDOW_CLOSED_REASON =
  "The 24h reply window has closed for this conversation. The contact has to message this account again to reopen it.";

/** Failures the retry route may re-queue; everything else stays final. */
export const RETRIABLE_REASONS = [
  NO_CONVERSATION_REASON,
  WINDOW_CLOSED_REASON,
] as const;

/**
 * Platforms that only accept a reply within 24 hours of the person's last
 * message. Telegram, X and Reddit have no such limit.
 */
const WINDOWED_PLATFORMS = new Set(["instagram", "facebook", "whatsapp"]);

const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a message can still be delivered into this conversation.
 *
 * `lastMessageAt` is the conversation's latest activity, which is an upper
 * bound on the person's last message: inside the window a send *may* be
 * accepted, outside it is certainly rejected. Treating it as authoritative
 * would be wrong in the other direction, so this only ever prevents sends
 * that were already doomed.
 */
export function isReplyWindowOpen({
  platform,
  lastMessageAt,
  now = Date.now(),
}: {
  platform: string;
  lastMessageAt: string | null;
  now?: number;
}): boolean {
  if (!WINDOWED_PLATFORMS.has(platform)) return true;
  if (!lastMessageAt) return false;

  const lastActivity = new Date(lastMessageAt).getTime();
  if (Number.isNaN(lastActivity)) return false;

  return now - lastActivity < WINDOW_MS;
}

/**
 * Recognizes Meta's "outside of allowed window" rejection so it can be stored
 * as WINDOW_CLOSED_REASON and stay retriable. Meta returns subcode 2534022,
 * but the wording reaches us through Zernio's error string, so both are
 * matched.
 */
export function isWindowClosedError(message: string): boolean {
  return (
    message.includes("2534022") ||
    /outside of allowed window/i.test(message) ||
    /outside the allowed window/i.test(message)
  );
}
