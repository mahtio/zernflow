/**
 * Inbox backfill from Zernio.
 *
 * The local `conversations` table is otherwise populated only by inbound
 * webhooks, so conversations that predate webhook registration never appear
 * in the Inbox (#12). This module pages through Zernio's inbox conversations
 * per channel and imports the ones missing locally.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Zernio } from "./zernio-client";
import { messagePreview } from "@/lib/message-preview";

/** Cap per channel, in pages of PAGE_SIZE conversations. */
const DEFAULT_MAX_PAGES_PER_CHANNEL = 4;
const PAGE_SIZE = 50;

export interface BackfillChannel {
  id: string;
  late_account_id: string;
  platform: string;
}

/** Conversation item shape returned by Zernio's listInboxConversations. */
interface ZernioInboxConversation {
  id?: string;
  participantId?: string;
  participantName?: string;
  participantPicture?: string | null;
  lastMessage?: string;
  updatedTime?: string;
  status?: "active" | "archived";
  unreadCount?: number | null;
}

/**
 * Finds or creates the contact behind a platform sender: reuses the mapping in
 * `contact_channels` (channel_id, platform_sender_id); otherwise inserts the
 * contact, its channel mapping, and a `contact_created` analytics event.
 * Returns null when the contact insert fails; `existed` tells whether the
 * sender was already known on this channel.
 * With `stampExisting: false` an existing contact's last_interaction_at is
 * left untouched; the caller stamps it once the interaction is confirmed.
 */
export async function upsertContactForSender({
  supabase,
  channel,
  senderId,
  senderName,
  senderPicture,
  senderUsername,
  interactionAt,
  stampExisting = true,
}: {
  supabase: SupabaseClient;
  channel: { id: string; workspace_id: string };
  senderId: string;
  senderName: string;
  senderPicture: string | null;
  senderUsername?: string | null;
  interactionAt: string;
  stampExisting?: boolean;
}): Promise<{ contactId: string; existed: boolean } | null> {
  const { data: existingContactChannel } = await supabase
    .from("contact_channels")
    .select("contact_id")
    .eq("channel_id", channel.id)
    .eq("platform_sender_id", senderId)
    .single();

  if (existingContactChannel) {
    if (stampExisting) {
      await supabase
        .from("contacts")
        .update({ last_interaction_at: interactionAt })
        .eq("id", existingContactChannel.contact_id);
    }
    return { contactId: existingContactChannel.contact_id, existed: true };
  }

  const { data: newContact } = await supabase
    .from("contacts")
    .insert({
      workspace_id: channel.workspace_id,
      display_name: senderName,
      avatar_url: senderPicture,
      last_interaction_at: interactionAt,
    })
    .select("id")
    .single();

  if (!newContact) return null;

  await supabase.from("contact_channels").insert({
    contact_id: newContact.id,
    channel_id: channel.id,
    platform_sender_id: senderId,
    platform_username: senderUsername ?? null,
  });

  await supabase.from("analytics_events").insert({
    workspace_id: channel.workspace_id,
    contact_id: newContact.id,
    event_type: "contact_created",
  });

  return { contactId: newContact.id, existed: false };
}

/**
 * Imports Zernio inbox conversations missing from the local `conversations`
 * table. Conversations already known by late_conversation_id are skipped, and
 * a row that already carries a late_conversation_id is left to the webhook so
 * its status / last_message_at / unread_count are never clobbered.
 *
 * Rows whose late_conversation_id is still null are *adopted*: the comment
 * flow creates a conversation before any DM exists, so without this those
 * contacts could never receive a broadcast or an inbox reply.
 *
 * A failing channel is logged and skipped, not fatal.
 */
export async function backfillInboxConversations({
  supabase,
  zernio,
  workspaceId,
  channels,
  maxPages = DEFAULT_MAX_PAGES_PER_CHANNEL,
}: {
  supabase: SupabaseClient;
  zernio: Zernio;
  workspaceId: string;
  channels: BackfillChannel[];
  maxPages?: number;
}): Promise<{ imported: number; linked: number }> {
  let imported = 0;
  let linked = 0;

  for (const channel of channels) {
    try {
      const result = await syncChannelInbox({
        supabase,
        zernio,
        workspaceId,
        channel,
        maxPages,
      });
      imported += result.imported;
      linked += result.linked;
    } catch (err) {
      console.error(
        `[inbox-sync] backfill failed for channel ${channel.id} (${channel.platform}):`,
        err
      );
    }
  }

  return { imported, linked };
}

/** Conversation ids already stored for a channel, read past PostgREST's 1000-row cap. */
async function fetchKnownConversationIds(
  supabase: SupabaseClient,
  channelId: string
): Promise<Set<string>> {
  const known = new Set<string>();
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data } = await supabase
      .from("conversations")
      .select("late_conversation_id")
      .eq("channel_id", channelId)
      .not("late_conversation_id", "is", null)
      .order("late_conversation_id")
      .range(from, from + pageSize - 1);

    const rows = (data ?? []) as { late_conversation_id: string | null }[];
    for (const row of rows) {
      if (row.late_conversation_id) known.add(row.late_conversation_id);
    }
    if (rows.length < pageSize) break;
  }

  return known;
}

/**
 * Syncs one bounded window of a channel's Zernio inbox and returns the cursor
 * to resume from, or null once the inbox is exhausted.
 *
 * Draining a large inbox takes minutes, far longer than a browser will wait on
 * a single request, so callers page through it in short successive calls.
 * Resuming across calls is safe: the upsert ignores conflicts and adoption only
 * writes while late_conversation_id is still null, so a participant already
 * handled in an earlier window cannot be overwritten by an older conversation.
 */
export async function syncChannelInbox({
  supabase,
  zernio,
  workspaceId,
  channel,
  cursor,
  maxPages = DEFAULT_MAX_PAGES_PER_CHANNEL,
}: {
  supabase: SupabaseClient;
  zernio: Zernio;
  workspaceId: string;
  channel: BackfillChannel;
  cursor?: string | null;
  maxPages?: number;
}): Promise<{ imported: number; linked: number; nextCursor: string | null }> {
  const known = await fetchKnownConversationIds(supabase, channel.id);

  let imported = 0;
  let linked = 0;
  let next: string | undefined = cursor ?? undefined;
  const seenParticipants = new Set<string>();

  for (let page = 0; page < maxPages; page++) {
    const res = await zernio.messages.listInboxConversations({
      query: {
        accountId: channel.late_account_id,
        limit: PAGE_SIZE,
        sortOrder: "desc",
        cursor: next,
      },
    });

    const conversations = (res.data?.data ?? []) as ZernioInboxConversation[];

    for (const conv of conversations) {
      if (!conv.id || !conv.participantId) continue;
      // A participant can have several Zernio conversations but the local
      // table is unique on (channel_id, contact_id). sortOrder desc means the
      // first conversation seen per participant is the most recent one; later
      // ones are dropped so they cannot overwrite it.
      if (seenParticipants.has(conv.participantId)) continue;
      seenParticipants.add(conv.participantId);
      if (known.has(conv.id)) continue;

      const outcome = await importConversation({
        supabase,
        workspaceId,
        channel,
        conv,
      });
      if (outcome === "imported") imported++;
      else if (outcome === "linked") linked++;
    }

    const pagination = res.data?.pagination;
    if (!pagination?.hasMore || !pagination.nextCursor) {
      return { imported, linked, nextCursor: null };
    }
    next = pagination.nextCursor;
  }

  // Page budget spent with more inbox left: hand the cursor back so the caller
  // can continue in the next request.
  return { imported, linked, nextCursor: next ?? null };
}

type ImportOutcome = "imported" | "linked" | "skipped" | "failed";

async function importConversation({
  supabase,
  workspaceId,
  channel,
  conv,
}: {
  supabase: SupabaseClient;
  workspaceId: string;
  channel: BackfillChannel;
  conv: ZernioInboxConversation;
}): Promise<ImportOutcome> {
  const interactionAt = conv.updatedTime ?? new Date().toISOString();
  const contact = await upsertContactForSender({
    supabase,
    channel: { id: channel.id, workspace_id: workspaceId },
    senderId: conv.participantId!,
    senderName: conv.participantName || conv.participantId!,
    senderPicture: conv.participantPicture || null,
    interactionAt,
    stampExisting: false,
  });

  if (!contact) {
    console.error(`[inbox-sync] failed to create contact for conversation ${conv.id}`);
    return "failed";
  }

  // ignoreDuplicates: an existing (channel_id, contact_id) row may be owned by
  // the webhook and must stay untouched; the conflict then returns no rows, so
  // it is not counted as imported either. The adoption step below handles the
  // one case where touching it is safe.
  const { data: insertedRows, error } = await supabase
    .from("conversations")
    .upsert(
      {
        workspace_id: workspaceId,
        channel_id: channel.id,
        contact_id: contact.contactId,
        platform: channel.platform,
        late_conversation_id: conv.id,
        status: conv.status === "archived" ? "closed" : "open",
        last_message_at: conv.updatedTime ?? null,
        last_message_preview: messagePreview(conv.lastMessage),
        unread_count: conv.unreadCount ?? 0,
      },
      { onConflict: "channel_id,contact_id", ignoreDuplicates: true }
    )
    .select("id");

  if (error) {
    console.error(`[inbox-sync] failed to upsert conversation ${conv.id}:`, error);
    return "failed";
  }

  if ((insertedRows ?? []).length > 0) {
    // Stamp the existing contact only after the conversation row was actually
    // inserted; a webhook-owned duplicate is not a new interaction.
    if (contact.existed) {
      await supabase
        .from("contacts")
        .update({ last_interaction_at: interactionAt })
        .eq("id", contact.contactId);
    }
    return "imported";
  }

  // A local row already owns (channel_id, contact_id). The comment flow
  // creates conversations before any Zernio DM exists, leaving
  // late_conversation_id null — and every delivery path (broadcasts, inbox
  // replies, flow messages) needs that id. Adopt it here, but only while it is
  // still null: a non-null value is webhook-owned and must not be rewritten.
  const { data: linkedRows, error: linkError } = await supabase
    .from("conversations")
    .update({ late_conversation_id: conv.id })
    .eq("channel_id", channel.id)
    .eq("contact_id", contact.contactId)
    .is("late_conversation_id", null)
    .select("id");

  if (linkError) {
    console.error(
      `[inbox-sync] failed to link conversation ${conv.id} to the existing row:`,
      linkError
    );
    return "failed";
  }

  return (linkedRows ?? []).length > 0 ? "linked" : "skipped";
}
