"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useLocale } from "@/components/locale-provider";

export default function ChannelCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useLocale();
  const pt = locale === "pt-BR";
  const [status, setStatus] = useState<"syncing" | "success" | "error">("syncing");
  const [message, setMessage] = useState(pt ? "Sincronizando seu novo canal..." : "Syncing your new channel...");

  useEffect(() => {
    async function syncAndRedirect() {
      const connected = searchParams.get("connected");

      if (!connected) {
        setStatus("error");
        setMessage(pt ? "A conexão foi cancelada ou falhou." : "Connection was cancelled or failed.");
        setTimeout(() => router.push("/dashboard/channels"), 2000);
        return;
      }

      try {
        const res = await fetch("/api/v1/channels/sync", { method: "POST" });
        const data = await res.json();

        if (!res.ok || data.error) {
          setStatus("error");
          setMessage(data.error || (pt ? "Não foi possível sincronizar os canais." : "Failed to sync channels."));
          setTimeout(() => router.push("/dashboard/channels"), 2000);
          return;
        }

        const { created } = data.synced;
        setStatus("success");
        setMessage(
          created > 0
            ? (pt ? `Conta ${connected} conectada com sucesso!` : `${connected} account connected successfully!`)
            : (pt ? "Conta conectada! O canal já está sincronizado." : "Account connected! Channel is already synced.")
        );
        setTimeout(() => router.push("/dashboard/channels"), 1500);
      } catch {
        setStatus("error");
        setMessage(pt ? "Não foi possível sincronizar. Tente sincronizar manualmente." : "Failed to sync. You can try syncing manually.");
        setTimeout(() => router.push("/dashboard/channels"), 2000);
      }
    }

    syncAndRedirect();
  }, [pt, router, searchParams]);

  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center">
        {status === "syncing" && (
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        )}
        {status === "success" && (
          <CheckCircle2 className="h-8 w-8 text-green-500" />
        )}
        {status === "error" && (
          <XCircle className="h-8 w-8 text-red-500" />
        )}
        <p className="text-sm font-medium text-foreground">{message}</p>
        <p className="text-xs text-muted-foreground">{pt ? "Redirecionando para canais..." : "Redirecting to channels..."}</p>
      </div>
    </div>
  );
}
