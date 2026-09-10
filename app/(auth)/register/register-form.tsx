"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LanguageSelector } from "@/components/language-selector";
import { useLocale } from "@/components/locale-provider";
import { acceptInvite, registerWithInvite } from "@/lib/actions/team";
import type { InviteContext } from "@/lib/invite-auth";

export function RegisterForm({ invite }: { invite: InviteContext }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { t } = useLocale();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const result = await registerWithInvite(invite.id, password, name);
    if (result.redirectTo) {
      router.replace(result.redirectTo);
      return;
    }
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    if (result.confirmationRequired) {
      setConfirmationEmail(result.email ?? invite.email);
      setLoading(false);
      return;
    }

    const accepted = await acceptInvite(invite.id);
    if (accepted.error) {
      setError(accepted.error);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  if (confirmationEmail) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center">
          <Image src="/logo.png" alt="ZernFlow" width={48} height={48} className="mx-auto mb-3" />
          <h1 className="text-xl font-bold">Confirme seu e-mail</h1>
          <p className="mt-2 text-sm text-muted-foreground">Enviamos uma confirmação para {confirmationEmail}. Depois de confirmar, o convite será concluído automaticamente.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="absolute right-4 top-4"><LanguageSelector className="w-48" /></div>
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Image src="/logo.png" alt="ZernFlow" width={48} height={48} className="mx-auto mb-3" />
          <h1 className="text-2xl font-bold">{t.createAccount}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Crie sua conta para acessar {invite.workspaceName}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-sm font-medium">Convite para {invite.workspaceName}</p>
          <p className="mt-1 text-xs text-muted-foreground">Acesso como {invite.role}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-medium">{t.name}</label>
            <input id="name" type="text" value={name} onChange={(event) => setName(event.target.value)} required className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder={t.namePlaceholder} />
          </div>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium">Email</label>
            <input id="email" type="email" value={invite.email} readOnly className="w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-muted-foreground outline-none" />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium">{t.password}</label>
            <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder={t.minCharacters} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button type="submit" disabled={loading} className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {loading ? t.creatingAccount : t.createAccount}
          </button>
        </form>
        <p className="text-center text-sm text-muted-foreground">Já possui uma conta? <Link href={`/login?invite=${encodeURIComponent(invite.id)}`} className="font-medium text-foreground hover:underline">Entrar</Link></p>
      </div>
    </div>
  );
}
