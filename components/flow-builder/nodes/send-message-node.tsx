"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ExternalLink, GitBranch, MessageCircle, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/components/locale-provider";
import type { MessageOption } from "@/lib/flow-engine/types";
import { optionHandle } from "@/lib/flow-engine/message-options";

export interface SendMessageNodeProps {
  label?: string;
  deliveryMode?: "standard" | "private_reply";
  messages?: Array<{
    text?: string;
    imageUrl?: string;
    mediaUrl?: string;
    interactionMode?: "none" | "buttons" | "quick_replies";
    options?: MessageOption[];
  }>;
}

function OptionIcon({ kind }: { kind: MessageOption["kind"] }) {
  if (kind === "url") return <ExternalLink className="h-3 w-3" />;
  if (kind === "quick_reply") return <MessageCircle className="h-3 w-3" />;
  return <GitBranch className="h-3 w-3" />;
}

export function SendMessageNode({ data, selected }: NodeProps) {
  const { locale } = useLocale();
  const pt = locale === "pt-BR";
  const nodeData = data as SendMessageNodeProps;
  const isPrivateReply = nodeData.deliveryMode === "private_reply";
  const label = nodeData.label || (isPrivateReply ? (pt ? "Resposta privada" : "Private reply") : (pt ? "Enviar mensagem" : "Send Message"));
  const firstMessage = nodeData.messages?.[0];
  const messageCount = nodeData.messages?.length || 0;
  const options = nodeData.messages?.flatMap((message) => message.options ?? []) ?? [];
  const hasOptionOutputs = options.length > 0;

  return (
    <div className={cn("relative w-64 rounded-lg border bg-card shadow-sm transition-shadow", selected ? "border-blue-500 shadow-md" : "border-border")}>
      <Handle type="target" position={Position.Top} className="!h-3 !w-3 !border-2 !border-blue-500 !bg-white" />
      <div className="flex items-center gap-2 rounded-t-lg bg-blue-500 px-3 py-2 text-white">
        <MessageSquare className="h-3.5 w-3.5" />
        <span className="text-xs font-semibold">{isPrivateReply ? (pt ? "Resposta privada" : "Private reply") : (pt ? "Enviar mensagem" : "Send Message")}</span>
      </div>
      <div className="p-3">
        {isPrivateReply && <span className="mb-2 inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-semibold text-blue-700">{pt ? "Primeira mensagem do comentário" : "First comment message"}</span>}
        <p className="text-sm font-medium">{label}</p>
        {firstMessage?.text && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{firstMessage.text}</p>}
        {!firstMessage && <p className="mt-1 text-xs italic text-muted-foreground">{pt ? "Sem mensagem configurada" : "No message configured"}</p>}
        <div className="mt-2 flex gap-2">
          {messageCount > 1 && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">{messageCount} {pt ? "mensagens" : "messages"}</span>}
          {options.length > 0 && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">{options.length} {pt ? "opções" : "options"}</span>}
        </div>
        {options.length > 0 && (
          <div className="mt-3 space-y-2 border-t border-border pt-2">
            {options.map((option) => (
              <div key={option.id} className="relative flex min-h-5 items-center gap-1.5 pr-2 text-[10px] text-muted-foreground">
                <OptionIcon kind={option.kind} />
                <span className="max-w-40 truncate">{option.title || (pt ? "Sem título" : "Untitled")}</span>
                <Handle
                  id={optionHandle(option.id)}
                  type="source"
                  position={Position.Right}
                  className="!right-[-18px] !h-3 !w-3 !border-2 !border-blue-500 !bg-white"
                />
              </div>
            ))}
          </div>
        )}
      </div>
      {!hasOptionOutputs && <Handle type="source" position={Position.Bottom} className="!h-3 !w-3 !border-2 !border-blue-500 !bg-white" />}
    </div>
  );
}
