import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { completeInviteForUser, getInviteContext, inviteAuthPath } from "@/lib/invite-auth";
import { AcceptInviteView } from "./accept-invite-view";
import { InviteStatus } from "./invite-status";

export default async function InvitePage({ params }: { params: Promise<{ inviteId: string }> }) {
  const { inviteId } = await params;
  const context = await getInviteContext(inviteId);

  if (!context.ok) {
    const status = context.reason === "not-found" ? "not-found" : context.reason === "expired" ? "expired" : "used";
    return <InviteStatus status={status} />;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(inviteAuthPath(context.invite));

  if (user.email?.toLowerCase() === context.invite.email.toLowerCase()) {
    const result = await completeInviteForUser(inviteId, user);
    if (result.ok) redirect("/dashboard");
  }

  return (
    <AcceptInviteView
      inviteId={inviteId}
      workspaceName={context.invite.workspaceName}
      role={context.invite.role}
      email={context.invite.email}
      currentUserEmail={user.email ?? null}
    />
  );
}
