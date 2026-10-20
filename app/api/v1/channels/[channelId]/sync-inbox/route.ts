import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createZernioClient } from "@/lib/zernio-client";
import { getWorkspaceCredentials } from "@/lib/workspace-credentials";
import { syncChannelInbox } from "@/lib/inbox-sync";

/**
 * Pages handled per request. Each conversation costs a few sequential database
 * round-trips, so this is kept small enough to answer in seconds: draining a
 * whole inbox in one request outlives the browser's patience and surfaces as a
 * bare "NetworkError". The client loops until nextCursor is null.
 */
const PAGES_PER_REQUEST = 2;

/**
 * POST /api/v1/channels/:channelId/sync-inbox
 *
 * Imports one window of the channel's Zernio inbox and returns the cursor to
 * resume from. Safe to call repeatedly: imports ignore conflicts and linking
 * only fills a conversation whose Zernio id is still missing.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const { channelId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // RLS limits channels to the caller's workspaces, so reading the row is both
  // the authorization check and the workspace lookup.
  const { data: channel } = await supabase
    .from("channels")
    .select("id, workspace_id, late_account_id, platform")
    .eq("id", channelId)
    .maybeSingle();

  if (!channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  let cursor: string | null = null;
  try {
    const body = await request.json();
    if (typeof body?.cursor === "string") cursor = body.cursor;
  } catch {
    // No body: start from the top of the inbox.
  }

  const credentials = await getWorkspaceCredentials(channel.workspace_id);
  if (!credentials?.late_api_key_encrypted) {
    return NextResponse.json(
      { error: "Zernio API key not configured. Go to Settings first." },
      { status: 400 }
    );
  }

  try {
    const { imported, linked, nextCursor } = await syncChannelInbox({
      supabase,
      zernio: createZernioClient(credentials.late_api_key_encrypted),
      workspaceId: channel.workspace_id,
      channel,
      cursor,
      maxPages: PAGES_PER_REQUEST,
    });

    return NextResponse.json({ imported, linked, nextCursor });
  } catch (error) {
    console.error("[channels/sync-inbox] failed:", error);
    return NextResponse.json(
      {
        error: `Failed to sync the inbox: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
      { status: 502 }
    );
  }
}
