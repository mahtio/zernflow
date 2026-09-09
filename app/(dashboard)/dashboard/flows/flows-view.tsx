"use client";

import Link from "next/link";
import { GitBranch, Plug, Sparkles } from "lucide-react";
import { CreateFlowButton } from "@/components/create-flow-button";
import {
  DeleteFlowButton,
  ExportFlowButton,
  ImportFlowButton,
} from "@/components/flow-actions";
import { useLocale } from "@/components/locale-provider";
import type { FlowStatus, Json } from "@/lib/types/database";

type Flow = {
  id: string;
  name: string;
  description: string | null;
  status: FlowStatus;
  updated_at: string;
  version: number;
  nodes: Json;
  edges: Json;
};

const statusClasses: Record<FlowStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  published:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  archived:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

export function FlowsView({
  flows,
  channelCount,
}: {
  flows: Flow[];
  channelCount: number;
}) {
  const { locale } = useLocale();
  const copy = locale === "pt-BR"
    ? {
        title: "Fluxos", description: "Crie fluxos automatizados de chatbot para seus canais", templates: "Modelos", connectTitle: "Conecte um canal para começar", connectDescription: "Vincule suas contas de redes sociais para que seus fluxos possam enviar e receber mensagens.", connect: "Conectar", emptyTitle: "Ainda não há fluxos", emptyDescription: "Crie seu primeiro fluxo e comece a automatizar conversas.", draft: "Rascunho", published: "Publicado", archived: "Arquivado", node: "nó", nodes: "nós", updated: "Atualizado",
      }
    : {
        title: "Flows", description: "Build automated chatbot flows for your channels", templates: "Templates", connectTitle: "Connect a channel to get started", connectDescription: "Link your social media accounts so your flows can send and receive messages.", connect: "Connect", emptyTitle: "No flows yet", emptyDescription: "Create your first flow to start automating conversations.", draft: "Draft", published: "Published", archived: "Archived", node: "node", nodes: "nodes", updated: "Updated",
      };

  const statusLabel: Record<FlowStatus, string> = {
    draft: copy.draft,
    published: copy.published,
    archived: copy.archived,
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{copy.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
          </div>
          <div className="flex items-center gap-3">
            <ImportFlowButton />
            <Link href="/dashboard/flows/templates" className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <Sparkles className="h-4 w-4" />
              {copy.templates}
            </Link>
            <CreateFlowButton />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-8 py-6">
        {channelCount === 0 && (
          <div className="mt-6 flex items-center gap-4 rounded-xl border border-dashed border-border bg-card p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Plug className="h-5 w-5 text-primary" /></div>
            <div className="flex-1"><p className="text-sm font-medium">{copy.connectTitle}</p><p className="text-xs text-muted-foreground">{copy.connectDescription}</p></div>
            <Link href="/dashboard/channels" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">{copy.connect}</Link>
          </div>
        )}

        {flows.length === 0 ? (
          <div className="mt-12 rounded-xl border border-dashed border-border p-12 text-center">
            <GitBranch className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">{copy.emptyTitle}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{copy.emptyDescription}</p>
            <div className="mt-4"><CreateFlowButton /></div>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {flows.map((flow) => {
              const nodeCount = Array.isArray(flow.nodes) ? flow.nodes.length : 0;
              return (
                <Link key={flow.id} href={`/dashboard/flows/${flow.id}`} className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/50">
                  <div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted"><GitBranch className="h-4 w-4 text-muted-foreground" /></div><div><div className="flex items-center gap-2"><h3 className="font-medium transition-colors group-hover:text-primary">{flow.name}</h3><span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClasses[flow.status]}`}>{statusLabel[flow.status]}</span></div><p className="text-xs text-muted-foreground">{nodeCount} {nodeCount === 1 ? copy.node : copy.nodes}</p></div></div><div className="flex items-center gap-1"><ExportFlowButton flow={flow} /><DeleteFlowButton flow={flow} /></div></div>
                  <p className="mt-4 text-xs text-muted-foreground">{copy.updated} {new Date(flow.updated_at).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
