import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Platform } from "@/lib/types/database";

export interface SegmentRule {
  id?: string;
  field: string;
  operator: string;
  value: string;
}

export interface SegmentGroup {
  id?: string;
  combinator: "and" | "or";
  rules: SegmentRule[];
}

export interface SegmentFilter {
  combinator: "and" | "or";
  groups: SegmentGroup[];
}

export interface RecipientPair {
  contactId: string;
  channelId: string;
}

/** PostgREST caps responses (default 1000 rows), so every list read is paginated. */
const PAGE_SIZE = 1000;

type PageReader<T> = (
  from: number,
  to: number
) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

async function fetchAll<T>(read: PageReader<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await read(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The segment builder stores tags by id, but older filters stored the name. */
async function findTagId(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  value: string
): Promise<string | null> {
  const query = supabase
    .from("tags")
    .select("id")
    .eq("workspace_id", workspaceId);

  const { data } = await (UUID_RE.test(value)
    ? query.eq("id", value)
    : query.eq("name", value)
  ).maybeSingle();

  return data?.id ?? null;
}

/** The segment builder joins slug and value with "::". */
function splitCustomFieldValue(value: string): [string, string] {
  const separator = value.includes("::") ? "::" : ":";
  const index = value.indexOf(separator);
  if (index === -1) return [value, ""];
  return [value.slice(0, index), value.slice(index + separator.length)];
}

/**
 * All subscribed contacts in the workspace. This is the universe every
 * segment rule is narrowed down from.
 */
async function fetchSubscribedContactIds(
  supabase: SupabaseClient<Database>,
  workspaceId: string
): Promise<string[]> {
  const rows = await fetchAll<{ id: string }>((from, to) =>
    supabase
      .from("contacts")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("is_subscribed", true)
      .order("id")
      .range(from, to)
  );
  return rows.map((r) => r.id);
}

/**
 * Resolve a segment filter into contact IDs.
 * With no filter, every subscribed contact in the workspace matches.
 *
 * Rules are evaluated workspace-wide and combined in memory, so we never send
 * thousands of IDs back to PostgREST in a query string.
 */
export async function resolveSegmentContacts(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  filter: SegmentFilter | null
): Promise<string[]> {
  const base = new Set(await fetchSubscribedContactIds(supabase, workspaceId));

  if (!base.size) return [];
  if (!filter?.groups?.length) return Array.from(base);

  const activeGroups = filter.groups
    .map((group) => ({
      ...group,
      rules: group.rules.filter((rule) => isRuleComplete(rule)),
    }))
    .filter((group) => group.rules.length > 0);

  // A filter with nothing filled in targets the whole base audience.
  if (!activeGroups.length) return Array.from(base);

  const groupResults: Set<string>[] = [];

  for (const group of activeGroups) {
    const ruleResults: Set<string>[] = [];
    for (const rule of group.rules) {
      ruleResults.push(await evaluateRule(supabase, workspaceId, rule, base));
    }
    groupResults.push(
      group.combinator === "or"
        ? unionSets(ruleResults)
        : intersectSets(ruleResults)
    );
  }

  const combined =
    filter.combinator === "or"
      ? unionSets(groupResults)
      : intersectSets(groupResults);

  return Array.from(combined).filter((id) => base.has(id));
}

/** A rule with no value selected should not silently wipe out the audience. */
function isRuleComplete(rule: SegmentRule): boolean {
  if (!rule?.field) return false;
  const value = rule.value?.trim() ?? "";
  if (!value) return false;
  if (rule.field === "custom_field") {
    const [slug] = splitCustomFieldValue(value);
    return slug.trim().length > 0;
  }
  return true;
}

async function evaluateRule(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  rule: SegmentRule,
  base: Set<string>
): Promise<Set<string>> {
  switch (rule.field) {
    case "has_tag":
    case "missing_tag": {
      const tagId = await findTagId(supabase, workspaceId, rule.value);

      if (!tagId) {
        // An unknown tag matches nobody, and everybody is "missing" it.
        return rule.field === "missing_tag" ? new Set(base) : new Set();
      }

      const rows = await fetchAll<{ contact_id: string }>((from, to) =>
        supabase
          .from("contact_tags")
          .select("contact_id")
          .eq("tag_id", tagId)
          .order("contact_id")
          .range(from, to)
      );

      const tagged = new Set(rows.map((r) => r.contact_id));
      return rule.field === "has_tag"
        ? intersectWithBase(tagged, base)
        : differenceFromBase(tagged, base);
    }

    case "platform": {
      const { data: channels } = await supabase
        .from("channels")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("platform", rule.value as Platform);

      const channelIds = (channels ?? []).map((c) => c.id);
      if (!channelIds.length) {
        return rule.operator === "not_equals" ? new Set(base) : new Set();
      }

      const rows = await fetchAll<{ contact_id: string }>((from, to) =>
        supabase
          .from("contact_channels")
          .select("contact_id")
          .in("channel_id", channelIds)
          .order("contact_id")
          .range(from, to)
      );

      const linked = new Set(rows.map((r) => r.contact_id));
      return rule.operator === "not_equals"
        ? differenceFromBase(linked, base)
        : intersectWithBase(linked, base);
    }

    case "is_subscribed":
      // The base audience is already restricted to subscribed contacts.
      return rule.value === "false" ? new Set() : new Set(base);

    case "last_interaction": {
      const parsed = new Date(rule.value);
      if (Number.isNaN(parsed.getTime())) return new Set(base);
      const date = parsed.toISOString();

      const rows = await fetchAll<{ id: string }>((from, to) => {
        let query = supabase
          .from("contacts")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("is_subscribed", true);

        query =
          rule.operator === "before"
            ? query.lt("last_interaction_at", date)
            : query.gt("last_interaction_at", date);

        return query.order("id").range(from, to);
      });

      return intersectWithBase(new Set(rows.map((r) => r.id)), base);
    }

    case "custom_field": {
      const [slug, fieldValue] = splitCustomFieldValue(rule.value);

      const { data: fieldDef } = await supabase
        .from("custom_field_definitions")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("slug", slug)
        .maybeSingle();

      if (!fieldDef) return new Set();

      const rows = await fetchAll<{ contact_id: string }>((from, to) => {
        let query = supabase
          .from("contact_custom_fields")
          .select("contact_id")
          .eq("field_id", fieldDef.id);

        switch (rule.operator) {
          case "not_equals":
            query = query.neq("value", fieldValue);
            break;
          case "contains":
            query = query.ilike("value", `%${fieldValue}%`);
            break;
          case "gt":
            query = query.gt("value", fieldValue);
            break;
          case "lt":
            query = query.lt("value", fieldValue);
            break;
          default:
            query = query.eq("value", fieldValue);
        }

        return query.order("contact_id").range(from, to);
      });

      return intersectWithBase(new Set(rows.map((r) => r.contact_id)), base);
    }

    default:
      return new Set(base);
  }
}

/**
 * Map contacts to the channel they can be reached on.
 * One recipient per contact, using the first linked channel in the workspace.
 */
export async function resolveRecipientPairs(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  contactIds: string[]
): Promise<RecipientPair[]> {
  if (!contactIds.length) return [];

  const { data: channels } = await supabase
    .from("channels")
    .select("id")
    .eq("workspace_id", workspaceId);

  const channelIds = (channels ?? []).map((c) => c.id);
  if (!channelIds.length) return [];

  const links = await fetchAll<{ contact_id: string; channel_id: string }>(
    (from, to) =>
      supabase
        .from("contact_channels")
        .select("contact_id, channel_id")
        .in("channel_id", channelIds)
        .order("contact_id")
        .range(from, to)
  );

  const wanted = new Set(contactIds);
  const seen = new Set<string>();
  const pairs: RecipientPair[] = [];

  for (const link of links) {
    if (!wanted.has(link.contact_id) || seen.has(link.contact_id)) continue;
    seen.add(link.contact_id);
    pairs.push({ contactId: link.contact_id, channelId: link.channel_id });
  }

  return pairs;
}

function intersectWithBase(set: Set<string>, base: Set<string>): Set<string> {
  const result = new Set<string>();
  for (const id of base) {
    if (set.has(id)) result.add(id);
  }
  return result;
}

function differenceFromBase(set: Set<string>, base: Set<string>): Set<string> {
  const result = new Set<string>();
  for (const id of base) {
    if (!set.has(id)) result.add(id);
  }
  return result;
}

function intersectSets(sets: Set<string>[]): Set<string> {
  if (!sets.length) return new Set();
  let result = sets[0];
  for (let i = 1; i < sets.length; i++) {
    const next = new Set<string>();
    for (const item of result) {
      if (sets[i].has(item)) next.add(item);
    }
    result = next;
  }
  return new Set(result);
}

function unionSets(sets: Set<string>[]): Set<string> {
  const result = new Set<string>();
  for (const set of sets) {
    for (const item of set) result.add(item);
  }
  return result;
}
