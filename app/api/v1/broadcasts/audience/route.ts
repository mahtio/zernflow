import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  resolveSegmentContacts,
  resolveRecipientPairs,
  type SegmentFilter,
} from "@/lib/segments";

/**
 * POST /api/v1/broadcasts/audience
 *
 * Previews how many contacts a broadcast would reach.
 * Body: { broadcastId } or { workspaceId, segmentFilter }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    broadcastId?: string;
    workspaceId?: string;
    segmentFilter?: SegmentFilter | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let workspaceId: string;
  let filter: SegmentFilter | null;

  if (body.broadcastId) {
    // RLS limits this to broadcasts in the user's workspaces.
    const { data: broadcast } = await supabase
      .from("broadcasts")
      .select("workspace_id, segment_filter")
      .eq("id", body.broadcastId)
      .maybeSingle();

    if (!broadcast) {
      return NextResponse.json(
        { error: "Broadcast not found" },
        { status: 404 }
      );
    }

    workspaceId = broadcast.workspace_id;
    filter = broadcast.segment_filter as unknown as SegmentFilter | null;
  } else if (body.workspaceId) {
    // Confirm membership before resolving an arbitrary workspace.
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("workspace_id", body.workspaceId)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    workspaceId = membership.workspace_id;
    filter = body.segmentFilter ?? null;
  } else {
    return NextResponse.json(
      { error: "broadcastId or workspaceId is required" },
      { status: 400 }
    );
  }

  try {
    const contactIds = await resolveSegmentContacts(
      supabase,
      workspaceId,
      filter
    );
    const pairs = await resolveRecipientPairs(
      supabase,
      workspaceId,
      contactIds
    );

    return NextResponse.json({
      matched: contactIds.length,
      reachable: pairs.length,
    });
  } catch (err) {
    console.error("Failed to preview broadcast audience:", err);
    return NextResponse.json(
      { error: "Failed to resolve the segment filter" },
      { status: 500 }
    );
  }
}
