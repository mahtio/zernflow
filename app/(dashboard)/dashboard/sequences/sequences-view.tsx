"use client";

import Link from "next/link";
import { ListOrdered } from "lucide-react";
import { CreateSequenceButton } from "@/components/sequences/create-sequence-button";
import { useLocale } from "@/components/locale-provider";
import type { Json, SequenceStatus } from "@/lib/types/database";

type Sequence = {
  id: string;
  name: string;
  description: string | null;
  status: SequenceStatus;
  steps: Json;
  updated_at: string;
};

const statusClasses: Record<SequenceStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  paused: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

export function SequencesView({ sequences, enrollmentCounts }: { sequences: Sequence[]; enrollmentCounts: Record<string, number> }) {
  const { locale } = useLocale();
  const pt = locale === "pt-BR";
  const copy = pt
    ? { title: "Sequências", description: "Crie campanhas automatizadas para nutrir contatos ao longo do tempo", emptyTitle: "Ainda não há sequências", emptyDescription: "Crie sua primeira sequência para nutrir contatos automaticamente.", draft: "Rascunho", active: "Ativa", paused: "Pausada", step: "etapa", steps: "etapas", enrolled: "inscritos", updated: "Atualizado" }
    : { title: "Sequences", description: "Create drip campaigns to nurture contacts over time", emptyTitle: "No sequences yet", emptyDescription: "Create your first sequence to start nurturing contacts automatically.", draft: "Draft", active: "Active", paused: "Paused", step: "step", steps: "steps", enrolled: "enrolled", updated: "Updated" };
  const statusLabels: Record<SequenceStatus, string> = { draft: copy.draft, active: copy.active, paused: copy.paused };

  return <div className="flex h-full flex-col">
    <div className="border-b border-border px-8 py-6"><div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">{copy.title}</h1><p className="mt-1 text-sm text-muted-foreground">{copy.description}</p></div><CreateSequenceButton /></div></div>
    <div className="flex-1 overflow-auto px-8 py-6">
      {sequences.length === 0 ? <div className="mt-12 rounded-xl border border-dashed border-border p-12 text-center"><ListOrdered className="mx-auto h-10 w-10 text-muted-foreground" /><h2 className="mt-4 text-lg font-semibold">{copy.emptyTitle}</h2><p className="mt-2 text-sm text-muted-foreground">{copy.emptyDescription}</p><div className="mt-4"><CreateSequenceButton /></div></div> : <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{sequences.map((sequence) => { const stepCount = Array.isArray(sequence.steps) ? sequence.steps.length : 0; const enrolled = enrollmentCounts[sequence.id] || 0; const name = pt && sequence.name === "Untitled Sequence" ? "Sequência sem título" : sequence.name; return <Link key={sequence.id} href={`/dashboard/sequences/${sequence.id}`} className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/50"><div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted"><ListOrdered className="h-4 w-4 text-muted-foreground" /></div><div><div className="flex items-center gap-2"><h3 className="font-medium transition-colors group-hover:text-primary">{name}</h3><span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClasses[sequence.status]}`}>{statusLabels[sequence.status]}</span></div><p className="text-xs text-muted-foreground">{stepCount} {stepCount === 1 ? copy.step : copy.steps}{enrolled > 0 && <span className="ml-2">{enrolled} {copy.enrolled}</span>}</p></div></div>{sequence.description && <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{sequence.description}</p>}<p className="mt-4 text-xs text-muted-foreground">{copy.updated} {new Date(sequence.updated_at).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</p></Link>; })}</div>}
    </div>
  </div>;
}
