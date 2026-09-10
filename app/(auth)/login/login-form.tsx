"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Github } from "lucide-react";
import { LanguageSelector } from "@/components/language-selector";
import { useLocale } from "@/components/locale-provider";
import { acceptInvite } from "@/lib/actions/team";
import { createClient } from "@/lib/supabase/client";
import type { InviteContext } from "@/lib/invite-auth";

export function LoginForm({ invite }: { invite: InviteContext | null }) {
  const [email, setEmail] = useState(invite?.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { t } = useLocale();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    if (invite) {
      const result = await acceptInvite(invite.id);
      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleGitHubLogin() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const callback = invite
      ? `/auth/callback?invite=${encodeURIComponent(invite.id)}`
      : "/auth/callback";
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${window.location.origin}${callback}` },
    });
    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="absolute right-4 top-4"><LanguageSelector className="w-48" /></div>
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Image src="/logo.png" alt="ZernFlow" width={48} height={48} className="mx-auto mb-3" />
          <h1 className="text-2xl font-bold">{t.welcomeBack}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {invite ? `Entre para acessar ${invite.workspaceName}` : t.signInToAccount}
          </p>
        </div>

        {invite && (
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <p className="text-sm font-medium">Convite para {invite.workspaceName}</p>
            <p className="mt-1 text-xs text-muted-foreground">Acesso como {invite.role}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium">Email</label>
            <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} readOnly={!!invite} required className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none read-only:bg-muted read-only:text-muted-foreground focus:ring-2 focus:ring-ring" placeholder="you@example.com" />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium">{t.password}</label>
            <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder={t.passwordPlaceholder} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button type="submit" disabled={loading} className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {loading ? t.signingIn : t.signIn}
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
          <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">{t.orContinueWith}</span></div>
        </div>
        <button onClick={handleGitHubLogin} disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-50">
          <Github className="h-4 w-4" /> GitHub
        </button>
      </div>
    </div>
  );
}
