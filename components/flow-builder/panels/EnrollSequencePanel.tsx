"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";
import { useLocale } from "@/components/locale-provider";

interface EnrollSequencePanelProps {
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}

interface SequenceOption {
  id: string;
  name: string;
  status: string;
}

export function EnrollSequencePanel({ data, onChange }: EnrollSequencePanelProps) {
  const { locale } = useLocale();
  const pt = locale === "pt-BR";
  const [sequences, setSequences] = useState<SequenceOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: rows } = await supabase
        .from("sequences")
        .select("id, name, status")
        .order("name", { ascending: true });

      setSequences(rows ?? []);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted p-4">
        <p className="text-sm font-medium text-foreground">
          {pt ? "Inscrever em sequência" : "Enroll in Sequence"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {pt ? "O contato será inscrito na sequência selecionada quando chegar a esta etapa." : "The contact will be enrolled in the selected drip sequence when they reach this step."}
        </p>
      </div>

      <div>
        <label className="mb-2 block text-xs font-semibold text-muted-foreground">
          {pt ? "Sequência" : "Sequence"}
        </label>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {pt ? "Carregando sequências..." : "Loading sequences..."}
          </div>
        ) : sequences.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {pt ? "Nenhuma sequência encontrada. Crie uma na seção Sequências primeiro." : "No sequences found. Create one in the Sequences section first."}
          </p>
        ) : (
          <select
            value={(data.sequenceId as string) || ""}
            onChange={(e) => onChange({ ...data, sequenceId: e.target.value })}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{pt ? "Selecionar sequência..." : "Select a sequence..."}</option>
            {sequences.map((seq) => (
              <option key={seq.id} value={seq.id}>
                {seq.name} ({pt ? ({ draft: "rascunho", active: "ativa", paused: "pausada" }[seq.status] ?? seq.status) : seq.status})
              </option>
            ))}
          </select>
        )}
        <p className="mt-1.5 text-xs text-muted-foreground">
          {pt ? "Somente sequências ativas inscreverão contatos durante a execução." : "Only active sequences will actually enroll contacts at runtime."}
        </p>
      </div>
    </div>
  );
}
