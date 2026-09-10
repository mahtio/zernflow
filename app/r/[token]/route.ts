import { after, NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { reactivateExpiredOptionSession, resumeSession } from "@/lib/flow-engine/engine";
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
      const { data: origin } = await supabase
        .from("flow_sessions")
        .select("*")
        .eq("id", tracked.sessionId)
        .eq("flow_id", tracked.flowId)
        .eq("waiting_node_id", tracked.nodeId)
        .eq("published_version", tracked.version)
        .contains("accepted_option_ids", [tracked.optionId])
        .maybeSingle();
      if (!origin) return;

      const [{ data: flow }, { data: channel }, { data: conversation }] = await Promise.all([
        supabase.from("flows").select("workspace_id").eq("id", origin.flow_id).single(),
        supabase.from("channels").select("late_account_id").eq("id", origin.channel_id).single(),
        supabase.from("conversations")
          .select("id, late_conversation_id")
          .eq("contact_id", origin.contact_id)
          .eq("channel_id", origin.channel_id)
          .maybeSingle(),
      ]);
      if (!flow || !conversation) return;

      const optionPayload = createOptionPayload(tracked.flowId, tracked.version, tracked.nodeId, tracked.optionId);
      const context = {
        triggerId: "",
        flowId: origin.flow_id,
        channelId: origin.channel_id,
        contactId: origin.contact_id,
        conversationId: conversation.id,
        workspaceId: flow.workspace_id,
        lateConversationId: conversation.late_conversation_id || undefined,
        lateAccountId: channel?.late_account_id || undefined,
        incomingMessage: { postbackPayload: optionPayload },
      };
      if (origin.status === "active" && origin.waiting_for_input) {
        await resumeSession(supabase, origin, context);
      } else if (origin.status === "expired") {
        await reactivateExpiredOptionSession(supabase, context, `tracked-link:${tracked.nonce}`);
      }
    } catch (error) {
      console.error("Tracked link session resume failed:", error);
    }
  });

  return NextResponse.redirect(tracked.destinationUrl, 302);
}
