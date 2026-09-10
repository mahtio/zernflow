import { NextRequest, NextResponse } from "next/server";
import { getApiWorkspaceId } from "@/lib/api-workspace";
import { createClient } from "@/lib/supabase/server";
import { BUILDER_TRIGGER_TYPES, buildDesiredTriggers } from "@/lib/flow-triggers";
import { normalizeCommentPrivateReplies } from "@/lib/flow-engine/comment-private-reply";
import type { FlowEdge, FlowNode, SendMessageNodeData } from "@/lib/flow-engine/types";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ flowId: string }> }
) {
  const { flowId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaceId = await getApiWorkspaceId(supabase, user.id);
  if (!workspaceId)
    return NextResponse.json({ error: "No workspace" }, { status: 404 });

  // Get current flow
  const { data: flow, error } = await supabase
    .from("flows")
    .select("*")
    .eq("id", flowId)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !flow)
    return NextResponse.json(
      { error: error?.message || "Flow not found" },
      { status: 404 }
    );

  const normalized = normalizeCommentPrivateReplies(
    (Array.isArray(flow.nodes) ? flow.nodes : []) as unknown as FlowNode[],
    (Array.isArray(flow.edges) ? flow.edges : []) as unknown as FlowEdge[],
    flowId
  );
  if (normalized.errors.length > 0) {
    return NextResponse.json(
      { error: normalized.errors.map((issue) => issue.message).join(" "), issues: normalized.errors },
      { status: 422 }
    );
  }

  // The current Zernio private-reply endpoint supports inline buttons but has
  // no attachment field. Reject configured images instead of silently losing them.
  const privateReplyWithImage = normalized.nodes.find((node) => {
    const data = node.data as SendMessageNodeData;
    return data.deliveryMode === "private_reply" && Boolean(data.messages[0]?.mediaUrl);
  });
  if (privateReplyWithImage) {
    return NextResponse.json(
      { error: "A integração Zernio atual não aceita imagem no endpoint de resposta privada. Remova a imagem desse nó para publicar.", nodeId: privateReplyWithImage.id },
      { status: 422 }
    );
  }

  // Persist normalized graph before status/version/trigger changes.
  const newVersion = flow.version + 1;
  const { error: updateError } = await supabase
    .from("flows")
    .update({
      nodes: normalized.nodes as unknown as typeof flow.nodes,
      edges: normalized.edges as unknown as typeof flow.edges,
      status: "published",
      published_at: new Date().toISOString(),
      version: newVersion,
    })
    .eq("id", flowId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Save version snapshot
  await supabase.from("flow_versions").insert({
    flow_id: flowId,
    version: newVersion,
    nodes: normalized.nodes as unknown as typeof flow.nodes,
    edges: normalized.edges as unknown as typeof flow.edges,
    viewport: flow.viewport,
    name: flow.name,
    published_by: user.id,
  });

  // Sync trigger rows from the flow's trigger nodes into the `triggers` table.
  // The runtime matcher (lib/flow-engine/trigger-matcher.ts) reads triggers.config,
  // but the builder only ever saved keywords into flows.nodes — so triggers configured
  // in the UI never fired in production. Reconcile them here on publish. This includes
  // `comment_keyword`: builder-created rows are workspace-wide (channel_id null), while
  // Growth-tab rows are channel-scoped (channel_id set) and must survive republish —
  // hence the null-channel guard on the delete below. A comment_keyword node with
  // "also match in DMs" emits a second row typed `keyword` (see below), so both rows
  // are reconciled together on every republish.
  const flowNodes = normalized.nodes as unknown as Array<Record<string, unknown>>;
  const desiredTriggers = buildDesiredTriggers(flowNodes, flowId);

  // Reconcile: clear the builder-managed trigger rows for this flow, then insert the
  // fresh set derived from the current node graph (delete-and-reinsert keeps the table
  // in sync with what was published and avoids duplicates on republish). Only
  // null-channel rows are builder-managed; channel-scoped rows belong to the Growth tab.
  await supabase
    .from("triggers")
    .delete()
    .eq("flow_id", flowId)
    .is("channel_id", null)
    .in("type", [...BUILDER_TRIGGER_TYPES]);

  if (desiredTriggers.length > 0) {
    const { error: insertError } = await supabase.from("triggers").insert(desiredTriggers);
    if (insertError) {
      console.error("[publish] Failed to sync triggers from flow nodes:", insertError);
    }
  }

  // Activate any remaining triggers for this flow (e.g. comment_keyword managed elsewhere).
  await supabase
    .from("triggers")
    .update({ is_active: true })
    .eq("flow_id", flowId);

  return NextResponse.json({ ...flow, nodes: normalized.nodes, edges: normalized.edges, status: "published", version: newVersion });
}
