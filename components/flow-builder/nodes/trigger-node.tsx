"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/components/locale-provider";

export interface TriggerNodeProps {
  label?: string;
  triggerType?: string;
  keywords?: Array<{ value: string; matchType: string }>;
  alsoMatchInDms?: boolean;
}

const triggerLabels: Record<string, string> = {
  keyword: "Keyword",
  postback: "Button Click",
  quick_reply: "Quick Reply",
  welcome: "Welcome Message",
  default: "Default Reply",
  comment_keyword: "Comment Keyword",
};

export function TriggerNode({ data, selected }: NodeProps) {
  const { locale } = useLocale();
  const pt = locale === "pt-BR";
  const nodeData = data as TriggerNodeProps;
  const triggerType = nodeData.triggerType || "keyword";
  const translatedLabels: Record<string, string> = { keyword: "Palavra-chave", postback: "Clique em botão", quick_reply: "Resposta rápida", welcome: "Mensagem de boas-vindas", default: "Resposta padrão", comment_keyword: "Palavra-chave em comentário" };
  const typeLabel = pt ? translatedLabels[triggerType] ?? "Gatilho" : triggerLabels[triggerType] || "Trigger";
  const label = nodeData.label || typeLabel;

  return (
    <div
      className={cn(
        "w-56 rounded-lg border bg-card shadow-sm transition-shadow",
        selected ? "border-emerald-500 shadow-md" : "border-border"
      )}
    >
      <div className="flex items-center gap-2 rounded-t-lg bg-emerald-500 px-3 py-2 text-white">
        <Zap className="h-3.5 w-3.5" />
        <span className="text-xs font-semibold">{pt ? "Gatilho" : "Trigger"}</span>
      </div>
      <div className="p-3">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium">{label}</p>
          {triggerType === "comment_keyword" && nodeData.alsoMatchInDms === true && (
            <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {pt ? "Também em mensagens diretas" : "Also in DMs"}
            </span>
          )}
        </div>
        {nodeData.keywords && nodeData.keywords.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {pt ? "Palavras-chave" : "Keywords"}:{" "}
            {nodeData.keywords
              .slice(0, 3)
              .map((k) => k.value)
              .join(", ")}
            {nodeData.keywords.length > 3 && ` +${nodeData.keywords.length - 3} ${pt ? "mais" : "more"}`}
          </p>
        )}
        {!nodeData.keywords?.length && triggerType !== "keyword" && (
          <p className="mt-1 text-xs text-muted-foreground">
            {typeLabel}
          </p>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-emerald-500 !bg-white"
      />
    </div>
  );
}
