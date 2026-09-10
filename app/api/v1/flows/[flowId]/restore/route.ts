import { NextRequest, NextResponse } from "next/server";
import { getApiWorkspaceId } from "@/lib/api-workspace";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ flowId: string }> }
) {
  const { flowId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaceId = await getApiWorkspaceId(supabase, user.id);
  if (!workspaceId) return NextResponse.json({ error: "No workspace" }, { status: 404 });

  const { data: flow, error } = await supabase
    .from("flows")
    .update({ deleted_at: null })
    .eq("id", flowId)
    .eq("workspace_id", workspaceId)
    .not("deleted_at", "is", null)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!flow) return NextResponse.json({ error: "Flow not found in trash" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
