import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { isHttpsDestination } from "@/lib/flow-engine/comment-private-reply";

export interface TrackedLinkPayload {
  sessionId: string;
  flowId: string;
  version: number;
  nodeId: string;
  optionId: string;
  destinationUrl: string;
  expiresAt: number;
  nonce: string;
}

function key(): Buffer {
  const value = process.env.TRACKED_LINK_SECRET;
  if (!value || value.length < 32) {
    throw new Error("TRACKED_LINK_SECRET deve ter pelo menos 32 caracteres");
  }
  return createHash("sha256").update(value).digest();
}

export function createTrackedLinkToken(
  input: Omit<TrackedLinkPayload, "expiresAt" | "nonce"> & {
    expiresAt?: number;
    nonce?: string;
  }
): string {
  if (!isHttpsDestination(input.destinationUrl)) {
    throw new Error("A URL rastreada deve usar HTTPS");
  }
  const payload: TrackedLinkPayload = {
    ...input,
    // Historical buttons can remain clickable. Authentication still binds the
    // immutable destination, flow version and option; internal execution is
    // independently idempotent when the click arrives.
    expiresAt: input.expiresAt ?? Date.now() + 365 * 24 * 60 * 60 * 1000,
    nonce: input.nonce ?? randomBytes(18).toString("base64url"),
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // Authenticated encryption prevents tampering and keeps internal session/node
  // identifiers opaque to the browser.
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function verifyTrackedLinkToken(token: string, now = Date.now()): TrackedLinkPayload {
  let payload: TrackedLinkPayload;
  try {
    const packed = Buffer.from(token, "base64url");
    if (packed.length < 29) throw new Error("short token");
    const iv = packed.subarray(0, 12);
    const tag = packed.subarray(12, 28);
    const encrypted = packed.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    payload = JSON.parse(Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8"));
  } catch {
    throw new Error("Token inválido ou adulterado");
  }
  if (!payload.sessionId || !payload.flowId || !Number.isInteger(payload.version) || !payload.nodeId || !payload.optionId || !payload.nonce || !isHttpsDestination(payload.destinationUrl)) {
    throw new Error("Payload inválido");
  }
  if (!Number.isFinite(payload.expiresAt) || payload.expiresAt <= now) {
    throw new Error("Token expirado");
  }
  return payload;
}

export function createTrackedLinkUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
  if (!base || !isHttpsDestination(base)) {
    throw new Error("NEXT_PUBLIC_APP_URL deve ser uma URL HTTPS para links rastreados");
  }
  return `${base}/r/${encodeURIComponent(token)}`;
}
