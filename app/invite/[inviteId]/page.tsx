import { createClient, createServiceClient } from "@/lib/supabase/server";
import { AcceptInviteView } from "./accept-invite-view";
import { InviteStatus } from "./invite-status";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ inviteId: string }>;
}) {
  const { inviteId } = await params;
  const supabase = await createClient();
  const serviceClient = await createServiceClient();

  // Fetch the invite using service client (public page, user may not be logged in)
  const { data: invite, error } = await serviceClient
    .from("workspace_invites")
    .select("*")
    .eq("id", inviteId)
    .single();

  if (error || !invite) {
    return <InviteStatus status="not-found" />;
  }

  const isExpired = new Date(invite.expires_at) < new Date();
  const isAlreadyAccepted = invite.status !== "pending";

  if (isExpired) {
    return <InviteStatus status="expired" />;
  }

  if (isAlreadyAccepted) {
    return <InviteStatus status="used" />;
  }

  // Get workspace name
  const { data: workspace } = await serviceClient
    .from("workspaces")
    .select("name")
    .eq("id", invite.workspace_id)
    .single();

  // Get inviter name
  const {
    data: { user: inviter },
  } = await serviceClient.auth.admin.getUserById(invite.invited_by);

  const inviterName =
    inviter?.user_metadata?.full_name ??
    inviter?.user_metadata?.name ??
    inviter?.email ??
    "Someone";

  // Check if current user is logged in
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <AcceptInviteView
      inviteId={invite.id}
      workspaceName={workspace?.name ?? "a workspace"}
      inviterName={inviterName}
      role={invite.role}
      email={invite.email}
      isLoggedIn={!!user}
      currentUserEmail={user?.email ?? null}
    />
  );
}
