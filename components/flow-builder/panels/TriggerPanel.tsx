"use client";

import { useCallback, useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/components/locale-provider";
import type { TriggerType } from "@/lib/types/database";

interface Keyword {
  value: string;
  matchType: "exact" | "contains" | "startsWith";
}

interface TriggerPanelData {
  triggerType?: string;
  keywords?: Keyword[];
  payload?: string;
  alsoMatchInDms?: boolean;
  [key: string]: unknown;
}

interface TriggerPanelProps {
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}

export function TriggerPanel({ data: rawData, onChange }: TriggerPanelProps) {
  const { locale } = useLocale();
  const pt = locale === "pt-BR";
  const data = rawData as TriggerPanelData;
  const triggerType = data.triggerType || "keyword";
  const keywords = data.keywords || [];
  const [newKeyword, setNewKeyword] = useState("");
  const [newMatchType, setNewMatchType] = useState<"exact" | "contains" | "startsWith">("contains");

  const triggerTypes: Array<{ value: TriggerType; label: string; description: string }> = [
    {
      value: "keyword",
      label: pt ? "Palavra-chave" : "Keyword",
      description: pt ? "Disparado quando um usuário envia uma palavra-chave correspondente" : "Triggered when a user sends a matching keyword",
    },
    {
      value: "postback",
      label: pt ? "Clique em botão" : "Button Click",
      description: pt ? "Disparado quando um usuário clica em um botão" : "Triggered when a user clicks a button",
    },
    {
      value: "quick_reply",
      label: pt ? "Resposta rápida" : "Quick Reply",
      description: pt ? "Disparado quando um usuário toca em uma resposta rápida" : "Triggered when a user taps a quick reply",
    },
    {
      value: "welcome",
      label: pt ? "Mensagem de boas-vindas" : "Welcome Message",
      description: pt ? "Disparado quando um usuário inicia uma conversa" : "Triggered when a user starts a conversation",
    },
    {
      value: "default",
      label: pt ? "Resposta padrão" : "Default Reply",
      description: pt ? "Disparado quando nenhum outro gatilho coincide" : "Triggered when no other trigger matches",
    },
    {
      value: "comment_keyword",
      label: pt ? "Palavra-chave em comentário" : "Comment Keyword",
      description: pt ? "Disparado por palavras-chave em comentários de publicações" : "Triggered by keywords in post comments",
    },
  ];

  const matchTypes: Array<{ value: "exact" | "contains" | "startsWith"; label: string }> = [
    { value: "exact", label: pt ? "Correspondência exata" : "Exact match" },
    { value: "contains", label: pt ? "Contém" : "Contains" },
    { value: "startsWith", label: pt ? "Começa com" : "Starts with" },
  ];

  const handleTriggerTypeChange = useCallback(
    (type: string) => {
      onChange({ ...data, triggerType: type });
    },
    [data, onChange]
  );

  const addKeyword = useCallback(() => {
    const trimmed = newKeyword.trim();
    if (!trimmed) return;
    const updated: Keyword[] = [...keywords, { value: trimmed, matchType: newMatchType }];
    onChange({ ...data, keywords: updated });
    setNewKeyword("");
  }, [data, keywords, newKeyword, newMatchType, onChange]);

  const removeKeyword = useCallback(
    (index: number) => {
      const updated = keywords.filter((_, i) => i !== index);
      onChange({ ...data, keywords: updated });
    },
    [data, keywords, onChange]
  );

  const updateKeywordMatchType = useCallback(
    (index: number, matchType: "exact" | "contains" | "startsWith") => {
      const updated = keywords.map((k, i) => (i === index ? { ...k, matchType } : k));
      onChange({ ...data, keywords: updated });
    },
    [data, keywords, onChange]
  );

  const showKeywords = triggerType === "keyword" || triggerType === "comment_keyword";
  const showPayload = triggerType === "postback" || triggerType === "quick_reply";

  return (
    <div className="space-y-5">
      {/* Trigger Type */}
      <div>
        <label className="mb-2 block text-xs font-semibold text-foreground">
          {pt ? "Tipo de gatilho" : "Trigger Type"}
        </label>
        <div className="space-y-1.5">
          {triggerTypes.map((t) => (
            <label
              key={t.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                triggerType === t.value
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
                  : "border-border bg-card hover:border-input"
              )}
            >
              <input
                type="radio"
                name="triggerType"
                value={t.value}
                checked={triggerType === t.value}
                onChange={() => handleTriggerTypeChange(t.value)}
                className="mt-0.5 h-4 w-4 border-input text-emerald-500 focus:ring-emerald-500"
              />
              <div>
                <p className="text-sm font-medium text-foreground">{t.label}</p>
                <p className="text-xs text-muted-foreground">{t.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Keywords Section */}
      {showKeywords && (
        <div>
          <label className="mb-2 block text-xs font-semibold text-foreground">
            {pt ? "Palavras-chave" : "Keywords"}
          </label>

          {/* Existing keywords */}
          {keywords.length > 0 && (
            <div className="mb-3 space-y-2">
              {keywords.map((keyword, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card p-2"
                >
                  <span className="flex-1 truncate text-sm text-foreground">
                    {keyword.value}
                  </span>
                  <select
                    value={keyword.matchType}
                    onChange={(e) =>
                      updateKeywordMatchType(index, e.target.value as "exact" | "contains" | "startsWith")
                    }
                    className="rounded border border-border bg-muted px-2 py-1 text-xs text-foreground"
                  >
                    {matchTypes.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeKeyword(index)}
                    className="rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add new keyword */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addKeyword();
                }
              }}
              placeholder={pt ? "Digite a palavra-chave..." : "Enter keyword..."}
              className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <select
              value={newMatchType}
              onChange={(e) => setNewMatchType(e.target.value as "exact" | "contains" | "startsWith")}
              className="rounded-lg border border-border bg-card px-2 py-2 text-xs text-foreground focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {matchTypes.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addKeyword}
              disabled={!newKeyword.trim()}
              className="rounded-lg bg-emerald-500 p-2 text-white transition-colors hover:bg-emerald-600 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {keywords.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {pt
                ? "Adicione palavras-chave que ativarão este fluxo. Pressione Enter ou clique em + para adicionar."
                : "Add keywords that will trigger this flow. Press Enter or click + to add."}
            </p>
          )}

          {/* Comment keywords only */}
          {triggerType === "comment_keyword" && (
            <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-card p-3">
              <input
                type="checkbox"
                checked={data.alsoMatchInDms === true}
                onChange={(e) => onChange({ ...data, alsoMatchInDms: e.target.checked })}
                disabled={keywords.length === 0}
                className="mt-0.5 h-4 w-4 rounded border-input text-emerald-500 focus:ring-emerald-500 disabled:opacity-40"
              />
              <div>
                <p className="text-sm font-medium text-foreground">{pt ? "Também corresponder em mensagens diretas" : "Also match in DMs"}</p>
                <p className="text-xs text-muted-foreground">
                  {keywords.length === 0
                    ? (pt ? "Adicione ao menos uma palavra-chave para usar esta opção." : "Add at least one keyword to use this.")
                    : (pt ? "Execute este fluxo quando alguém enviar a palavra-chave por mensagem direta, não apenas em comentários." : "Run this flow when someone sends a keyword as a direct message, not just as a comment.")}
                </p>
                {data.alsoMatchInDms === true && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {pt
                      ? "Uma mensagem direta não tem um comentário associado, logo respostas públicas e variáveis de comentário ({{comment_text}}, {{post_id}}) estarão vazias nessa execução."
                      : "A DM has no comment behind it, so public replies and the comment variables ({{comment_text}}, {{post_id}}) are empty on that run."}
                  </p>
                )}
              </div>
            </label>
          )}
        </div>
      )}

      {/* Payload Section */}
      {showPayload && (
        <div>
          <label className="mb-2 block text-xs font-semibold text-foreground">
            {pt ? "Carga útil (Payload)" : "Payload"}
          </label>
          <input
            type="text"
            value={data.payload || ""}
            onChange={(e) => onChange({ ...data, payload: e.target.value })}
            placeholder={pt ? "Digite o valor do payload..." : "Enter payload value..."}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            {pt
              ? `O valor do payload para coincidir quando ${triggerType === "postback" ? "um botão for clicado" : "uma resposta rápida for tocada"}.`
              : `The payload value to match when a ${triggerType === "postback" ? "button is clicked" : "quick reply is tapped"}.`}
          </p>
        </div>
      )}
    </div>
  );
}
