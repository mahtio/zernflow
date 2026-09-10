"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/components/locale-provider";

export interface SendMessageNodeProps {
  label?: string;
  deliveryMode?: "standard" | "private_reply";
  messages?: Array<{
    text?: string;
    imageUrl?: string;
    mediaUrl?: string;
    privateReplyButton?: { title: string; type: string };
    quickReplies?: Array<{ title: string; payload: string }>;
    buttons?: Array<{ title: string; type: string; payload?: string; url?: string }>;
  }>;
}

export function SendMessageNode({ data, selected }: NodeProps) {
  const { locale } = useLocale();
  const pt = locale === "pt-BR";
  const nodeData = data as SendMessageNodeProps;
  const isPrivateReply = nodeData.deliveryMode === "private_reply";
  const label = nodeData.label || (isPrivateReply ? (pt ? "Resposta privada" : "Private reply") : (pt ? "Enviar mensagem" : "Send Message"));
  const firstMessage = nodeData.messages?.[0];
  const messageCount = nodeData.messages?.length || 0;
  const buttonCount = isPrivateReply
    ? (firstMessage?.privateReplyButton ? 1 : 0)
    : nodeData.messages?.reduce(
      (acc, m) => acc + (m.buttons?.length || 0) + (m.quickReplies?.length || 0),
      0
    ) || 0;

  return (
    <div
      className={cn(
        "w-56 rounded-lg border bg-card shadow-sm transition-shadow",
        selected ? "border-blue-500 shadow-md" : "border-border"
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-blue-500 !bg-white"
      />
      <div className="flex items-center gap-2 rounded-t-lg bg-blue-500 px-3 py-2 text-white">
        <MessageSquare className="h-3.5 w-3.5" />
        <span className="text-xs font-semibold">{isPrivateReply ? (pt ? "Resposta privada" : "Private reply") : (pt ? "Enviar mensagem" : "Send Message")}</span>
      </div>
      <div className="p-3">
        {isPrivateReply && (
          <span className="mb-2 inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-semibold text-blue-700">
            {pt ? "Primeira mensagem do comentário" : "First comment message"}
          </span>
        )}
        <p className="text-sm font-medium">{label}</p>
        {isPrivateReply && (
          <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
            {pt ? "Uma resposta privada antes da interação do contato." : "One private reply before contact interaction."}
          </p>
        )}
        {firstMessage?.text && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {firstMessage.text}
          </p>
        )}
        {!firstMessage?.text && firstMessage?.imageUrl && (
          <p className="mt-1 text-xs text-muted-foreground">{pt ? "Mensagem com imagem" : "Image message"}</p>
        )}
        {!firstMessage && (
          <p className="mt-1 text-xs text-muted-foreground italic">No message configured</p>
        )}
        <div className="mt-2 flex gap-2">
          {messageCount > 1 && (
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
              {messageCount} {pt ? "mensagens" : "messages"}
            </span>
          )}
          {buttonCount > 0 && (
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
              {buttonCount} {buttonCount === 1 ? (pt ? "botão" : "button") : (pt ? "botões" : "buttons")}
            </span>
          )}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-blue-500 !bg-white"
      />
    </div>
  );
}
