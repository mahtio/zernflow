import { beforeEach, describe, expect, it } from "vitest";

beforeEach(() => {
  process.env.TRACKED_LINK_SECRET = "test-secret-with-at-least-thirty-two-characters";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
});

describe("tracked links", () => {
  it("assina, valida e monta a URL pública", async () => {
    const { createTrackedLinkToken, createTrackedLinkUrl, verifyTrackedLinkToken } = await import("./tracked-link");
    const token = createTrackedLinkToken({
      sessionId: "session-1",
      nodeId: "node-1",
      destinationUrl: "https://destination.com/path",
      expiresAt: 2_000,
      nonce: "nonce-1",
    });
    expect(verifyTrackedLinkToken(token, 1_000)).toMatchObject({ sessionId: "session-1", nodeId: "node-1" });
    expect(createTrackedLinkUrl(token)).toBe(`https://app.example.com/r/${token}`);
    expect(Buffer.from(token, "base64url").toString("utf8")).not.toContain("session-1");
  });

  it("rejeita adulteração, expiração e protocolos perigosos", async () => {
    const { createTrackedLinkToken, verifyTrackedLinkToken } = await import("./tracked-link");
    const token = createTrackedLinkToken({ sessionId: "s", nodeId: "n", destinationUrl: "https://example.com", expiresAt: 2_000 });
    expect(() => verifyTrackedLinkToken(`${token}x`, 1_000)).toThrow("adulterado");
    expect(() => verifyTrackedLinkToken(token, 2_000)).toThrow("Token expirado");
    expect(() => createTrackedLinkToken({ sessionId: "s", nodeId: "n", destinationUrl: "data:text/html,test" })).toThrow("HTTPS");
  });
});
