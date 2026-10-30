/**
 * Shared keyword matching used by DM triggers, comment triggers and the flow
 * simulator so all three agree on what "contains" means.
 */

export type KeywordMatchType = "exact" | "contains" | "startsWith";

export function normalizeKeywordText(value: string): string {
  return value.toLowerCase().trim();
}

const NUMERIC_KEYWORD = /^\d+$/;

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= "0" && char <= "9";
}

/**
 * A number is only "mentioned" when it stands on its own. Plain substring
 * matching makes a keyword like `2` swallow `2027`, `12/06/1952` and every
 * other comment carrying a digit, stealing them from the specific automation.
 */
function containsNumber(text: string, keyword: string): boolean {
  for (let index = text.indexOf(keyword); index !== -1; index = text.indexOf(keyword, index + 1)) {
    if (!isDigit(text[index - 1]) && !isDigit(text[index + keyword.length])) return true;
  }
  return false;
}

/** Both arguments must already be normalized via `normalizeKeywordText`. */
export function keywordMatches(
  text: string,
  keyword: string,
  matchType: KeywordMatchType = "contains",
): boolean {
  if (!text || !keyword) return false;

  if (matchType === "exact") return text === keyword;

  const numeric = NUMERIC_KEYWORD.test(keyword);

  if (matchType === "startsWith") {
    if (!text.startsWith(keyword)) return false;
    return !numeric || !isDigit(text[keyword.length]);
  }

  return numeric ? containsNumber(text, keyword) : text.includes(keyword);
}

export function matchRankOf(matchType: KeywordMatchType): number {
  return matchType === "exact" ? 3 : matchType === "startsWith" ? 2 : 1;
}
