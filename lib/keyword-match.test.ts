import { describe, it, expect } from "vitest";
import { keywordMatches, normalizeKeywordText } from "./keyword-match";

const m = (text: string, keyword: string, matchType?: "exact" | "contains" | "startsWith") =>
  keywordMatches(normalizeKeywordText(text), normalizeKeywordText(keyword), matchType);

describe("keywordMatches", () => {
  it("matches text keywords as plain substrings", () => {
    expect(m("quero a minha COR", "cor")).toBe(true);
    expect(m("adorei as cores", "cor")).toBe(true);
    expect(m("nada aqui", "cor")).toBe(false);
  });

  it("does not let a single digit match a digit inside a larger number", () => {
    expect(m("2027", "2")).toBe(false);
    expect(m("Quero a cor 2027", "2")).toBe(false);
    expect(m("12/06/1952", "2")).toBe(false);
    expect(m("1952", "19")).toBe(false);
  });

  it("still matches a number that stands on its own", () => {
    expect(m("2", "2")).toBe(true);
    expect(m("o meu deu 2", "2")).toBe(true);
    expect(m("número 2!", "2")).toBe(true);
    expect(m("18+10+2=30 / 3 + 0= 3", "3")).toBe(true);
    expect(m("deu 10 aqui", "10")).toBe(true);
  });

  it("matches a longer number exactly where it appears", () => {
    expect(m("quero 2027 agora", "2027")).toBe(true);
    expect(m("2027", "2027")).toBe(true);
  });

  it("applies the same number boundary to startsWith", () => {
    expect(m("2027 por favor", "2")).toBe(false);
    expect(m("2 por favor", "2")).toBe(true);
    expect(m("2027 por favor", "2027", "startsWith")).toBe(true);
  });

  it("keeps exact matching untouched", () => {
    expect(m("  2027 ", "2027", "exact")).toBe(true);
    expect(m("cor 2027", "2027", "exact")).toBe(false);
  });

  it("leaves mixed keywords such as dates as substrings", () => {
    expect(m("quero o portal 09/09, por favor", "09/09")).toBe(true);
    expect(m("portal 9:9", "9:9")).toBe(true);
  });

  it("never matches empty input", () => {
    expect(m("", "2")).toBe(false);
    expect(m("2", "  ")).toBe(false);
  });
});
