import { after, NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { resumeSession } from "@/lib/flow-engine/engine";
import { createOptionPayload } from "@/lib/flow-engine/interaction-resolver";
import { verifyTrackedLinkToken } from "@/lib/tracked-link";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  let tracked;
  try {
    tracked = verifyTrackedLinkToken((await params).token);
  } catch {
    return NextResponse.json({ error: "Link inválido ou expirado" }, { status: 400 });
  }

  // Redirect is returned immediately. Session continuation is resilient and a
  // failure never prevents the visitor from reaching the signed destination.
  after(async () => {
    try {
      const supabase = await createServiceClient();
      const { data: session } = await supabase
        .from("flow_sessions")
        .select("*")
        .eq("id", tracked.sessionId)
        .eq("status", "active")
        .eq("waiting_for_input", true)
        .eq("current_node_id", tracked.nodeId)
        .eq("published_version", tracked.version)
        .contains("accepted_option_ids", [tracked.optionId])
        .maybeSingle();
      if (!session) return;

      const [{ data: flow }, { data: channel }, { data: conversation }] = await Promise.all([
        supabase.from("flows").select("workspace_id").eq("id", session.flow_id).single(),
        supabase.from("channels").select("late_account_id").eq("id", session.channel_id).single(),
        supabase.from("conversations")
          .select("id, late_conversation_id")
          .eq("contact_id", session.contact_id)
          .eq("channel_id", session.channel_id)
          .maybeSingle(),
      ]);
      if (!flow || !conversation) return;

      await resumeSession(supabase, session, {
        triggerId: "",
        flowId: session.flow_id,
        channelId: session.channel_id,
        contactId: session.contact_id,
        conversationId: conversation.id,
        workspaceId: flow.workspace_id,
        lateConversationId: conversation.late_conversation_id || undefined,
        lateAccountId: channel?.late_account_id || undefined,
        incomingMessage: {
          postbackPayload: createOptionPayload(tracked.flowId, tracked.version, tracked.nodeId, tracked.optionId),
        },
      });
    } catch (error) {
      console.error("Tracked link session resume failed:", error);
    }
  });

  return NextResponse.redirect(tracked.destinationUrl, 302);
}
