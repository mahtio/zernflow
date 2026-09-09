import { NextRequest, NextResponse } from "next/server";
import { getApiWorkspaceId } from "@/lib/api-workspace";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ flowId: string }> }
) {
  const { flowId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workspaceId = await getApiWorkspaceId(supabase, user.id);
  if (!workspaceId)
    return NextResponse.json({ error: "No workspace" }, { status: 404 });

  const { data: flow, error } = await supabase
    .from("flows")
    .select("*, triggers(*)")
    .eq("id", flowId)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !flow)
    return NextResponse.json({ error: "Flow not found" }, { status: 404 });

  return NextResponse.json(flow);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ flowId: string }> }
) {
  const { flowId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workspaceId = await getApiWorkspaceId(supabase, user.id);
  if (!workspaceId)
    return NextResponse.json({ error: "No workspace" }, { status: 404 });

  const body = await request.json();

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.description !== undefined) update.description = body.description;
  if (body.nodes !== undefined) update.nodes = body.nodes;
  if (body.edges !== undefined) update.edges = body.edges;
  if (body.viewport !== undefined) update.viewport = body.viewport;

  const { data: flow, error } = await supabase
    .from("flows")
    .update(update)
    .eq("id", flowId)
    .eq("workspace_id", workspaceId)
    .select("id, name, status, updated_at")
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(flow);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ flowId: string }> }
) {
  const { flowId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workspaceId = await getApiWorkspaceId(supabase, user.id);
  if (!workspaceId)
    return NextResponse.json({ error: "No workspace" }, { status: 404 });

  const { error } = await supabase
    .from("flows")
    .delete()
    .eq("id", flowId)
    .eq("workspace_id", workspaceId);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
