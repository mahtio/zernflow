import { describe, expect, it } from "vitest";
import { inviteAuthPath, safeInternalPath } from "@/lib/invite-paths";

describe("invite routes", () => {
  it("uses the mode stored on the invite and never includes the email", () => {
    expect(inviteAuthPath({ id: "invite-123", authMode: "login" })).toBe("/login?invite=invite-123");
    expect(inviteAuthPath({ id: "invite-123", authMode: "register" })).toBe("/register?invite=invite-123");
  });

  it("accepts only internal callback destinations", () => {
    expect(safeInternalPath("/dashboard/settings")).toBe("/dashboard/settings");
    expect(safeInternalPath("https://attacker.example")).toBe("/dashboard");
    expect(safeInternalPath("//attacker.example")).toBe("/dashboard");
    expect(safeInternalPath(null)).toBe("/dashboard");
  });
});
