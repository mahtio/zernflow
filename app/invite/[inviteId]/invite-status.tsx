"use client";

import Link from "next/link";
import { useLocale } from "@/components/locale-provider";

type Status = "not-found" | "expired" | "used";

export function InviteStatus({ status }: { status: Status }) {
  const { locale } = useLocale();
  const pt = locale === "pt-BR";
  const content = {
    "not-found": {
      title: pt ? "Convite não encontrado" : "Invite not found",
      description: pt ? "Este link de convite pode ser inválido ou ter sido revogado." : "This invite link may be invalid or has been revoked.",
      href: "/login",
      action: pt ? "Ir para o login" : "Go to Login",
    },
    expired: {
      title: pt ? "Convite expirado" : "Invite expired",
      description: pt ? "Este convite expirou. Peça ao proprietário do espaço de trabalho para enviar um novo." : "This invite has expired. Please ask the workspace owner to send a new one.",
      href: "/login",
      action: pt ? "Ir para o login" : "Go to Login",
    },
    used: {
      title: pt ? "Convite já utilizado" : "Invite already used",
      description: pt ? "Este convite já foi aceito." : "This invite has already been accepted.",
      href: "/dashboard",
      action: pt ? "Ir para o painel" : "Go to Dashboard",
    },
  }[status];

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-2xl font-bold">{content.title}</h1>
        <p className="text-sm text-muted-foreground">{content.description}</p>
        <Link href={content.href} className="inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          {content.action}
        </Link>
      </div>
    </div>
  );
}
