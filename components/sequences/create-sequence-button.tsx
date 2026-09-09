"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { createSequence } from "@/lib/actions/sequences";
import { useLocale } from "@/components/locale-provider";

export function CreateSequenceButton() {
  const router = useRouter();
  const { locale } = useLocale();
  const pt = locale === "pt-BR";
  const [creating, setCreating] = useState(false);
  const pendingRef = useRef(false);

  async function handleCreate() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setCreating(true);

    try {
      const result = await createSequence(pt ? "Sequência sem título" : "Untitled Sequence");

      if (result.error) {
        console.error("Failed to create sequence:", result.error);
        alert(pt ? `Não foi possível criar a sequência: ${result.error}` : `Failed to create sequence: ${result.error}`);
        return;
      }

      if (result.sequence) {
        router.push(`/dashboard/sequences/${result.sequence.id}`);
      }
    } catch (err) {
      console.error("Failed to create sequence:", err);
      alert(pt ? `Não foi possível criar a sequência: ${err instanceof Error ? err.message : "Erro desconhecido"}` : `Failed to create sequence: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      pendingRef.current = false;
      setCreating(false);
    }
  }

  return (
    <button
      onClick={handleCreate}
      disabled={creating}
      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
    >
      {creating ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Plus className="h-4 w-4" />
      )}
      {creating ? (pt ? "Criando..." : "Creating...") : (pt ? "Nova sequência" : "New Sequence")}
    </button>
  );
}
