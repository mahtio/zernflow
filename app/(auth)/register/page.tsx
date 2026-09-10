import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getInviteContext } from "@/lib/invite-auth";
import { RegisterForm } from "./register-form";

function InviteOnlyMessage({ message = "O cadastro é feito somente por convite." }: { message?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center">
        <Image src="/logo.png" alt="ZernFlow" width={48} height={48} className="mx-auto mb-3" />
        <h1 className="text-xl font-bold">Cadastro restrito</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <Link href="/login" className="mt-5 inline-flex rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">Voltar ao login</Link>
      </div>
    </div>
  );
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite: inviteId } = await searchParams;
  if (!inviteId) return <InviteOnlyMessage />;

  const context = await getInviteContext(inviteId);
  if (!context.ok) return <InviteOnlyMessage message="Este convite é inválido, expirou ou já foi utilizado." />;
  if (context.invite.authMode !== "register") {
    redirect(`/login?invite=${encodeURIComponent(inviteId)}`);
  }

  return <RegisterForm invite={context.invite} />;
}
