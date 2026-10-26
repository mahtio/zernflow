import { describe, it, expect } from "vitest";
import { matchCommentTrigger, type CommentForMatching } from "./comment-processor";
import type { Database } from "@/lib/types/database";

type Trigger = Database["public"]["Tables"]["triggers"]["Row"];

function trigger(id: string, config: Record<string, unknown>): Trigger {
  return {
    id,
    flow_id: `flow-${id}`,
    channel_id: null,
    type: "comment_keyword",
    config,
    priority: 50,
    is_active: true,
    created_at: new Date().toISOString(),
  } as unknown as Trigger;
}

const comment = (text: string, postId = "post-1"): CommentForMatching => ({
  text,
  postId,
});

describe("matchCommentTrigger", () => {
  it("matches a contains keyword case-insensitively (default matchType)", () => {
    const t = trigger("t1", { keywords: [{ value: "Socrates" }] });
    expect(matchCommentTrigger([t], comment("love SOCRATES so much"))?.id).toBe("t1");
  });

  it("matches exact only on full trimmed text", () => {
    const t = trigger("t1", { keywords: [{ value: "price", matchType: "exact" }] });
    expect(matchCommentTrigger([t], comment("  PRICE "))?.id).toBe("t1");
    expect(matchCommentTrigger([t], comment("price please"))).toBeNull();
  });

  it("matches startsWith from the beginning only", () => {
    const t = trigger("t1", { keywords: [{ value: "info", matchType: "startsWith" }] });
    expect(matchCommentTrigger([t], comment("info please"))?.id).toBe("t1");
    expect(matchCommentTrigger([t], comment("more info"))).toBeNull();
  });

  it("treats slash-separated numeric comments as literal text", () => {
    const t = trigger("t1", { keywords: [{ value: "09/09", matchType: "exact" }] });
    expect(matchCommentTrigger([t], comment("09/09"))?.id).toBe("t1");
    expect(matchCommentTrigger([t], comment("9/9"))).toBeNull();
  });

  it("matches 09/09 inside comment text when configured as contains", () => {
    const t = trigger("t1", { keywords: [{ value: "09/09", matchType: "contains" }] });
    expect(matchCommentTrigger([t], comment("Quero o portal 09/09, por favor"))?.id).toBe("t1");
  });

  it("honors explicit priority regardless of input order or keyword length", () => {
    const low = trigger("low", { keywords: [{ value: "COR" }] });
    const high = { ...trigger("high", { keywords: [{ value: "2" }] }), priority: 100 };
    expect(matchCommentTrigger([low, high], comment("Cor o meu deu 2"))?.id).toBe("high");
  });

  it.each(["Cor o meu deu 2", "Qual a cor do número 5", "COR 2027"])(
    "chooses COR rather than a generic number for %s at equal priority",
    (text) => {
      const numbers = trigger("numbers", { keywords: ["1", "2", "3", "4", "5"].map((value) => ({ value })) });
      const cor = trigger("cor", { keywords: [{ value: "COR", matchType: "contains" }] });
      expect(matchCommentTrigger([numbers, cor], comment(text))?.id).toBe("cor");
      expect(matchCommentTrigger([cor, numbers], comment(text))?.id).toBe("cor");
    }
  );

  it("keeps numeric-only comments on the numeric automation", () => {
    const numbers = trigger("numbers", { keywords: [{ value: "2" }] });
    const cor = trigger("cor", { keywords: [{ value: "COR" }] });
    expect(matchCommentTrigger([cor, numbers], comment("2"))?.id).toBe("numbers");
  });

  it("prefers a specific year to generic digits at equal priority", () => {
    const numbers = trigger("numbers", { keywords: [{ value: "2" }] });
    const year = trigger("year", { keywords: [{ value: "2027" }] });
    expect(matchCommentTrigger([numbers, year], comment("Quero 2027"))?.id).toBe("year");
  });

  it("ranks exact above startsWith above contains at equal priority", () => {
    const contains = trigger("contains", { keywords: [{ value: "COR", matchType: "contains" }] });
    const starts = trigger("starts", { keywords: [{ value: "CO", matchType: "startsWith" }] });
    const exact = trigger("exact", { keywords: [{ value: "COR", matchType: "exact" }] });
    expect(matchCommentTrigger([contains, starts, exact], comment("COR"))?.id).toBe("exact");
    expect(matchCommentTrigger([contains, starts], comment("COR"))?.id).toBe("starts");
  });

  it("breaks equal matches by stable id rather than database row order", () => {
    const a = trigger("a", { keywords: [{ value: "COR" }] });
    const b = trigger("b", { keywords: [{ value: "COR" }] });
    expect(matchCommentTrigger([b, a], comment("Cor"))?.id).toBe("a");
    expect(matchCommentTrigger([a, b], comment("Cor"))?.id).toBe("a");
  });

  it("ignores empty keywords", () => {
    const empty = trigger("empty", { keywords: [{ value: "   " }] });
    expect(matchCommentTrigger([empty], comment("Cor"))).toBeNull();
  });

  it("respects postIds scoping", () => {
    const t = trigger("t1", { keywords: [{ value: "promo" }], postIds: ["post-9"] });
    expect(matchCommentTrigger([t], comment("promo", "post-1"))).toBeNull();
    expect(matchCommentTrigger([t], comment("promo", "post-9"))?.id).toBe("t1");
  });

  it("skips triggers without keywords and returns null when nothing matches", () => {
    const empty = trigger("t1", {});
    const other = trigger("t2", { keywords: [{ value: "xyz" }] });
    expect(matchCommentTrigger([empty, other], comment("hello world"))).toBeNull();
  });

  it("returns null for empty comment text", () => {
    const t = trigger("t1", { keywords: [{ value: "hi" }] });
    expect(matchCommentTrigger([t], comment("   "))).toBeNull();
  });
});
