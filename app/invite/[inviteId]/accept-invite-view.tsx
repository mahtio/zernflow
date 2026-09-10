"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function AcceptInviteView({
  inviteId,
  workspaceName,
  role,
  email,
  currentUserEmail,
}: {
  inviteId: string;
  workspaceName: string;
  role: string;
  email: string;
  currentUserEmail: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function switchAccount() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace(`/login?invite=${encodeURIComponent(inviteId)}`);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <Image src="/logo.png" alt="ZernFlow" width={48} height={48} className="mx-auto" />
        <div>
          <h1 className="text-2xl font-bold">Use a conta convidada</h1>
          <p className="mt-2 text-sm text-muted-foreground">Você está conectado como {currentUserEmail}, mas o convite para {workspaceName} foi enviado para {email} com papel {role}.</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <Users className="mx-auto h-6 w-6 text-amber-700" />
          <p className="mt-3 text-sm text-amber-900">O convite não foi aceito. Troque de conta para continuar sem perder o contexto.</p>
          <button onClick={switchAccount} disabled={loading} className="mt-4 rounded-lg bg-amber-800 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
            {loading ? "Saindo..." : "Trocar conta"}
          </button>
        </div>
      </div>
    </div>
  );
}
