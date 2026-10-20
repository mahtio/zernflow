import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { RETRIABLE_REASONS, isReplyWindowOpen } from "@/lib/broadcast-window";
import type { Json } from "@/lib/types/database";

/** PostgREST caps responses at 1000 rows, so every list read is paginated. */
const PAGE_SIZE = 1000;
/** Keeps `in(...)` filters out of oversized query strings. */
const UPDATE_CHUNK = 200;
const JOB_CHUNK = 100;

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
 * Re-queues recipients blocked by an unsynced conversation or closed window
 * only when they are now linked and inside the platform's reply window.
 * The saved message_content is reused as-is.
 *
 * Linking the conversations is a separate, resumable step
 * (/api/v1/channels/:channelId/sync-inbox); this route only reads what is
 * already stored, so it answers fast.
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

  // 1. Every conversation that now carries a Zernio id, with the data needed
  //    to tell whether the reply window is still open.
  const conversations = await fetchAll<{
    contact_id: string;
    channel_id: string;
    platform: string;
    last_message_at: string | null;
  }>((from, to) =>
    supabase
      .from("conversations")
      .select("contact_id, channel_id, platform, last_message_at")
      .eq("workspace_id", broadcast.workspace_id)
      .not("late_conversation_id", "is", null)
      // Ordered by the primary key: contact_id alone is not unique (a contact
      // can have one conversation per channel), which makes paging unstable
      // and can silently skip rows.
      .order("id")
      .range(from, to)
  );

  const linked = new Map(
    conversations.map((c) => [`${c.contact_id}:${c.channel_id}`, c])
  );

  // 2. Only failures known to be safe to retry, never uncertain deliveries.
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
      .in("error_message", [...RETRIABLE_REASONS])
      .order("id")
      .range(from, to)
  );

  const now = Date.now();
  const retryable: string[] = [];
  let stillUnlinked = 0;
  let outsideWindow = 0;

  for (const recipient of stranded) {
    const conversation = linked.get(
      `${recipient.contact_id}:${recipient.channel_id}`
    );

    if (!conversation) {
      stillUnlinked++;
      continue;
    }

    if (!isReplyWindowOpen({
      platform: conversation.platform,
      lastMessageAt: conversation.last_message_at,
      now,
    })) {
      outsideWindow++;
      continue;
    }

    retryable.push(recipient.id);
  }

  if (!retryable.length) {
    return NextResponse.json({
      requeued: 0,
      stillUnlinked,
      outsideWindow,
    });
  }

  // 3. Flip them back to pending. The status filter keeps the update idempotent
  //    if two runs overlap, and only rows this run actually claimed are queued.
  const requeuedIds: string[] = [];
  for (const batch of chunk(retryable, UPDATE_CHUNK)) {
    const { data: updated, error: updateError } = await supabase
      .from("broadcast_recipients")
      .update({ status: "pending", error_message: null })
      .in("id", batch)
      .eq("status", "failed")
      .in("error_message", [...RETRIABLE_REASONS])
      .select("id");

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to re-queue recipients: ${updateError.message}` },
        { status: 500 }
      );
    }
    requeuedIds.push(...(updated ?? []).map((r) => r.id));
  }

  // 4. Queue one delivery job per recipient, spaced like the original send.
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

  // 5. Recompute the counters from the recipient rows rather than adjusting
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
    requeued: requeuedIds.length,
    stillUnlinked,
    outsideWindow,
  });
}
