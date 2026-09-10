import { redirect } from "next/navigation";
import { getInviteContext } from "@/lib/invite-auth";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite: inviteId } = await searchParams;
  if (!inviteId) return <LoginForm invite={null} />;

  const context = await getInviteContext(inviteId);
  if (!context.ok) redirect(`/invite/${encodeURIComponent(inviteId)}`);
  if (context.invite.authMode !== "login") {
    redirect(`/register?invite=${encodeURIComponent(inviteId)}`);
  }

  return <LoginForm invite={context.invite} />;
}
