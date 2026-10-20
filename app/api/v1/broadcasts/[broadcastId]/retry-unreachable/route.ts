import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createZernioClient } from "@/lib/zernio-client";
import { getWorkspaceCredentials } from "@/lib/workspace-credentials";
import { backfillInboxConversations } from "@/lib/inbox-sync";
import type { Json } from "@/lib/types/database";

/**
 * The exact reason the queue worker records when a contact has no Zernio
 * conversation. Only these failures are retried: the send provably never
 * reached Zernio, so re-queueing cannot produce a duplicate message. A
 * recipient that failed inside the API call is left alone.
 */
const NO_CONVERSATION_REASON =
  "No synced conversation for this contact on this channel";

/** PostgREST caps responses at 1000 rows, so every list read is paginated. */
const PAGE_SIZE = 1000;
/** Keeps `in(...)` filters out of oversized query strings. */
const UPDATE_CHUNK = 200;
const JOB_CHUNK = 100;
/** The comment flow can leave thousands of unlinked conversations behind. */
const MAX_PAGES_PER_CHANNEL = 40;

// Paging the whole inbox is far slower than a normal request, so raise the
// budget above the 15s default.
export const maxDuration = 300;

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

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

/**
 * POST /api/v1/broadcasts/:broadcastId/retry-unreachable
 *
 * Syncs the inbox so comment-created conversations get their Zernio id, then
 * re-queues the recipients that failed purely for the lack of one. The saved
 * message_content is reused as-is.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ broadcastId: string }> }
) {
  const { broadcastId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // RLS restricts visibility to the caller's workspaces, so reading the
  // broadcast is both the authorization check and the workspace lookup.
  const { data: broadcast, error: broadcastError } = await supabase
    .from("broadcasts")
    .select("id, workspace_id, message_content")
    .eq("id", broadcastId)
    .maybeSingle();

  if (broadcastError || !broadcast) {
    return NextResponse.json({ error: "Broadcast not found" }, { status: 404 });
  }

  const messageText = (broadcast.message_content as { text?: string } | null)
    ?.text;
  if (!messageText?.trim()) {
    return NextResponse.json(
      { error: "This broadcast has no message saved yet." },
      { status: 400 }
    );
  }

  const credentials = await getWorkspaceCredentials(broadcast.workspace_id);
  if (!credentials?.late_api_key_encrypted) {
    return NextResponse.json(
      { error: "Zernio API key not configured. Go to Settings first." },
      { status: 400 }
    );
  }

  const { data: channels } = await supabase
    .from("channels")
    .select("id, late_account_id, platform")
    .eq("workspace_id", broadcast.workspace_id)
    .eq("is_active", true);

  if (!channels?.length) {
    return NextResponse.json(
      { error: "No active channel in this workspace." },
      { status: 400 }
    );
  }

  // 1. Pull the inbox so conversations created by the comment flow (which have
  //    no late_conversation_id) adopt their Zernio id.
  const zernio = createZernioClient(credentials.late_api_key_encrypted);
  const { imported, linked } = await backfillInboxConversations({
    supabase,
    zernio,
    workspaceId: broadcast.workspace_id,
    channels,
    maxPages: MAX_PAGES_PER_CHANNEL,
  });

  // 2. Which (contact, channel) pairs can now be delivered to.
  const conversations = await fetchAll<{
    contact_id: string;
    channel_id: string;
  }>((from, to) =>
    supabase
      .from("conversations")
      .select("contact_id, channel_id")
      .eq("workspace_id", broadcast.workspace_id)
      .not("late_conversation_id", "is", null)
      // Ordered by the primary key: contact_id alone is not unique (a contact
      // can have one conversation per channel), which makes paging unstable
      // and can silently skip rows.
      .order("id")
      .range(from, to)
  );

  const reachable = new Set(
    conversations.map((c) => `${c.contact_id}:${c.channel_id}`)
  );

  // 3. Recipients that failed only for the missing conversation.
  const stranded = await fetchAll<{
    id: string;
    contact_id: string;
    channel_id: string;
  }>((from, to) =>
    supabase
      .from("broadcast_recipients")
      .select("id, contact_id, channel_id")
      .eq("broadcast_id", broadcastId)
      .eq("status", "failed")
      .eq("error_message", NO_CONVERSATION_REASON)
      .order("id")
      .range(from, to)
  );

  const retryable = stranded.filter((r) =>
    reachable.has(`${r.contact_id}:${r.channel_id}`)
  );

  if (!retryable.length) {
    return NextResponse.json({
      conversationsImported: imported,
      conversationsLinked: linked,
      requeued: 0,
      stillUnreachable: stranded.length,
    });
  }

  // 4. Flip them back to pending. The status filter keeps the update idempotent
  //    if two runs overlap, and only rows this run actually claimed are queued.
  const requeuedIds: string[] = [];
  for (const batch of chunk(retryable.map((r) => r.id), UPDATE_CHUNK)) {
    const { data: updated, error: updateError } = await supabase
      .from("broadcast_recipients")
      .update({ status: "pending", error_message: null })
      .in("id", batch)
      .eq("status", "failed")
      .select("id");

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to re-queue recipients: ${updateError.message}` },
        { status: 500 }
      );
    }
    requeuedIds.push(...(updated ?? []).map((r) => r.id));
  }

  // 5. Queue one delivery job per recipient, spaced like the original send.
  const jobs = requeuedIds.map((recipientId, index) => ({
    type: "send_broadcast",
    payload: { broadcastId, recipientId } as unknown as Json,
    run_at: new Date(Date.now() + index * 100).toISOString(),
    status: "pending" as const,
  }));

  for (const batch of chunk(jobs, JOB_CHUNK)) {
    const { error: jobError } = await supabase
      .from("scheduled_jobs")
      .insert(batch);
    if (jobError) {
      return NextResponse.json(
        { error: `Failed to schedule delivery: ${jobError.message}` },
        { status: 500 }
      );
    }
  }

  // 6. Recompute the counters from the recipient rows rather than adjusting
  //    them by hand, so they cannot drift out of sync with reality.
  const [{ count: sentCount }, { count: failedCount }] = await Promise.all([
    supabase
      .from("broadcast_recipients")
      .select("id", { count: "exact", head: true })
      .eq("broadcast_id", broadcastId)
      .eq("status", "sent"),
    supabase
      .from("broadcast_recipients")
      .select("id", { count: "exact", head: true })
      .eq("broadcast_id", broadcastId)
      .eq("status", "failed"),
  ]);

  await supabase
    .from("broadcasts")
    .update({
      status: "sending",
      sent: sentCount ?? 0,
      delivered: sentCount ?? 0,
      failed: failedCount ?? 0,
    })
    .eq("id", broadcastId);

  return NextResponse.json({
    conversationsImported: imported,
    conversationsLinked: linked,
    requeued: requeuedIds.length,
    stillUnreachable: stranded.length - requeuedIds.length,
  });
}
