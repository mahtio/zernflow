"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  Paperclip,
  Bot,
  User,
  MessageSquare,
  CheckCircle,
  Clock,
  RotateCcw,
  Loader2,
  FileText,
  ExternalLink,
  X,
  AlertCircle,
  Check,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { PlatformIcon } from "@/components/platform-icon";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useLocale } from "@/components/locale-provider";
import type { Database, ConversationStatus } from "@/lib/types/database";

type Message = Database["public"]["Tables"]["messages"]["Row"];
type Conversation = Database["public"]["Tables"]["conversations"]["Row"] & {
  contacts: Database["public"]["Tables"]["contacts"]["Row"] | null;
};

const LINK_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

function MessageText({ text, pt }: { text: string; pt: boolean }) {
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const parts = text.split(LINK_PATTERN);

  function confirmOpenLink() {
    if (!pendingUrl) return;
    const url = pendingUrl.startsWith("www.") ? `https://${pendingUrl}` : pendingUrl;
    window.open(url, "_blank", "noopener,noreferrer");
    setPendingUrl(null);
  }

  return (
    <>
      <p className="whitespace-pre-wrap">
        {parts.map((part, index) =>
          /^(https?:\/\/|www\.)/i.test(part) ? (
            <button
              key={`${part}-${index}`}
              type="button"
              onClick={() => setPendingUrl(part)}
              className="break-all text-left underline underline-offset-2 hover:opacity-80"
            >
              {part}
            </button>
          ) : (
            part
          )
        )}
      </p>
      <ConfirmDialog
        open={pendingUrl !== null}
        title={pt ? "Abrir link externo?" : "Open external link?"}
        message={
          pt
            ? `Este link levará você para um site externo: ${pendingUrl ?? ""}. Deseja continuar?`
            : `This link will take you to an external website: ${pendingUrl ?? ""}. Do you want to continue?`
        }
        confirmLabel={pt ? "Abrir link" : "Open link"}
        cancelLabel={pt ? "Cancelar" : "Cancel"}
        onConfirm={confirmOpenLink}
        onCancel={() => setPendingUrl(null)}
      />
    </>
  );
}

interface Attachment {
  id?: string | null;
  type: string;
  url: string;
  filename?: string | null;
  previewUrl?: string | null;
}

function getSocialPostPlatform(url: string): "instagram" | "facebook" | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname === "instagram.com" || hostname.endsWith(".instagram.com")) return "instagram";
    if (
      hostname === "facebook.com" ||
      hostname.endsWith(".facebook.com") ||
      hostname === "fb.watch" ||
      hostname.endsWith(".fb.watch")
    ) {
      return "facebook";
    }
  } catch {
    return null;
  }

  return null;
}

function getAttachments(
  value: Message["attachments"],
  messageId?: string,
  conversationId?: string
): Attachment[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const attachment = item as Record<string, unknown>;
    if (typeof attachment.type !== "string" || typeof attachment.url !== "string") return [];

    let url = attachment.url;
    let previewUrl = typeof attachment.previewUrl === "string" ? attachment.previewUrl : null;

    // Route protected Zernio WhatsApp media URLs through the authenticated proxy
    if (url.includes("zernio.com") && url.includes("whatsapp/media") && messageId && conversationId) {
      url = `/api/v1/messages/media?conversationId=${conversationId}&messageId=${messageId}&attachmentIndex=${index}`;
      if (previewUrl) {
        previewUrl = `/api/v1/messages/media?conversationId=${conversationId}&messageId=${messageId}&attachmentIndex=${index}&preview=true`;
      }
    }

    return [{
      id: typeof attachment.id === "string" ? attachment.id : null,
      type: attachment.type,
      url,
      filename: typeof attachment.filename === "string" ? attachment.filename : null,
      previewUrl,
    }];
  });
}

function AttachmentList({ attachments, pt }: { attachments: Attachment[]; pt: boolean }) {
  const [pendingAttachment, setPendingAttachment] = useState<Attachment | null>(null);

  function openAttachment() {
    if (!pendingAttachment) return;
    window.open(pendingAttachment.url, "_blank", "noopener,noreferrer");
    setPendingAttachment(null);
  }

  return (
    <>
      <div className="mt-2 space-y-2 first:mt-0">
        {attachments.map((attachment, index) => {
          const key = attachment.id ?? `${attachment.url}-${index}`;
          const label = attachment.filename || (pt ? "Abrir anexo" : "Open attachment");
          const socialPostPlatform = getSocialPostPlatform(attachment.url);

          if (socialPostPlatform) {
            const platformName = socialPostPlatform === "instagram" ? "Instagram" : "Facebook";
            return (
              <button
                key={key}
                type="button"
                onClick={() => setPendingAttachment(attachment)}
                className="flex w-full min-w-64 items-center gap-3 rounded-lg border border-current/20 p-3 text-left hover:bg-black/5"
              >
                <PlatformIcon platform={socialPostPlatform} size={22} className="shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {pt ? `Publicação do ${platformName}` : `${platformName} post`}
                  </span>
                  <span className="block text-xs opacity-70">
                    {pt ? "Abrir publicação" : "Open post"}
                  </span>
                </span>
                <ExternalLink className="h-4 w-4 shrink-0" />
              </button>
            );
          }

          if (attachment.type === "image" || attachment.type === "sticker") {
            return (
              <button
                key={key}
                type="button"
                onClick={() => setPendingAttachment(attachment)}
                className="block max-w-full overflow-hidden rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label={pt ? "Abrir imagem em uma nova aba" : "Open image in a new tab"}
              >
                <img
                  src={attachment.previewUrl || attachment.url}
                  alt={attachment.filename || (pt ? "Imagem anexada" : "Attached image")}
                  loading="lazy"
                  className={cn(
                    "max-h-80 max-w-full rounded-lg object-contain",
                    attachment.type === "sticker" ? "w-40" : "min-w-40"
                  )}
                />
              </button>
            );
          }

          if (attachment.type === "video") {
            return (
              <div key={key} className="space-y-1.5">
                <video
                  poster={attachment.previewUrl ?? undefined}
                  controls
                  preload="metadata"
                  playsInline
                  className="max-h-80 max-w-full rounded-lg"
                >
                  <source src={attachment.url} />
                  {pt ? "Seu navegador não suporta vídeo." : "Your browser does not support video."}
                </video>
                <button
                  type="button"
                  onClick={() => setPendingAttachment(attachment)}
                  className="flex items-center gap-1 text-xs underline underline-offset-2 hover:opacity-80"
                >
                  <ExternalLink className="h-3 w-3" />
                  {pt ? "Abrir vídeo em nova aba" : "Open video in a new tab"}
                </button>
              </div>
            );
          }

          if (attachment.type === "audio") {
            return (
              <div key={key} className="py-1">
                <audio src={attachment.url} controls preload="metadata" className="max-w-full">
                  {pt ? "Seu navegador não suporta áudio." : "Your browser does not support audio."}
                </audio>
              </div>
            );
          }

          return (
            <button
              key={key}
              type="button"
              onClick={() => setPendingAttachment(attachment)}
              className="flex w-full items-center gap-2 rounded-lg border border-current/20 p-2 text-left hover:bg-black/5"
            >
              <FileText className="h-5 w-5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-xs font-medium">{label}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </button>
          );
        })}
      </div>
      <ConfirmDialog
        open={pendingAttachment !== null}
        title={
          pendingAttachment && getSocialPostPlatform(pendingAttachment.url)
            ? (pt ? "Abrir publicação externa?" : "Open external post?")
            : (pt ? "Abrir anexo externo?" : "Open external attachment?")
        }
        message={
          pendingAttachment && getSocialPostPlatform(pendingAttachment.url)
            ? (pt
                ? "Esta publicação será aberta em uma nova aba. Deseja continuar?"
                : "This post will open in a new tab. Do you want to continue?")
            : (pt
                ? `Este anexo será aberto em uma nova aba${pendingAttachment?.filename ? `: ${pendingAttachment.filename}` : ""}. Deseja continuar?`
                : `This attachment will open in a new tab${pendingAttachment?.filename ? `: ${pendingAttachment.filename}` : ""}. Do you want to continue?`)
        }
        confirmLabel={
          pendingAttachment && getSocialPostPlatform(pendingAttachment.url)
            ? (pt ? "Abrir publicação" : "Open post")
            : (pt ? "Abrir anexo" : "Open attachment")
        }
        cancelLabel={pt ? "Cancelar" : "Cancel"}
        onConfirm={openAttachment}
        onCancel={() => setPendingAttachment(null)}
      />
    </>
  );
}

function formatMessageTime(dateStr: string, locale: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

function formatDateSeparator(dateStr: string, locale: string, today: string, yesterday: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return today;
  if (diffDays === 1) return yesterday;
  return date.toLocaleDateString(locale, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function shouldShowDateSeparator(
  current: Message,
  previous: Message | undefined
): boolean {
  if (!previous) return true;
  const currentDate = new Date(current.created_at).toDateString();
  const previousDate = new Date(previous.created_at).toDateString();
  return currentDate !== previousDate;
}

function hasRenderableContent(message: Message): boolean {
  return Boolean(message.text?.trim()) || getAttachments(message.attachments, message.id, message.conversation_id).length > 0;
}

function mergeMessages(current: Message[], fresh: Message[]): Message[] {
  const byId = new Map(current.map((message) => [message.id, message]));

  for (const message of fresh) {
    const optimisticMatch = current.find(
      (candidate) =>
        candidate.id.startsWith("optimistic-") &&
        candidate.direction === message.direction &&
        candidate.text === message.text
    );
    if (optimisticMatch) byId.delete(optimisticMatch.id);
    byId.set(message.id, message);
  }

  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

function MessageBubble({ message, locale, pt }: { message: Message; locale: string; pt: boolean }) {
  const isInbound = message.direction === "inbound";
  const isBot = message.sent_by_flow_id !== null;
  const isPending = message.status === "pending";
  const isFailed = message.status === "failed";
  const attachments = getAttachments(message.attachments, message.id, message.conversation_id);

  return (
    <div
      className={cn(
        "flex gap-2",
        isInbound ? "justify-start" : "justify-end"
      )}
    >
      {isInbound && (
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-muted">
          <User className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}

      <div className="max-w-[70%]">
        <div
          className={cn(
            "rounded-2xl px-4 py-2 text-sm transition-opacity",
            isInbound
              ? "rounded-tl-md bg-muted text-foreground"
              : isFailed
              ? "rounded-tr-md bg-destructive text-destructive-foreground"
              : "rounded-tr-md bg-primary text-primary-foreground",
            isPending && "opacity-80"
          )}
        >
          {message.text && <MessageText text={message.text} pt={pt} />}
          {attachments.length > 0 && <AttachmentList attachments={attachments} pt={pt} />}
          {message.attachments && attachments.length === 0 && (
            <div className="mt-1">
              <Paperclip className="inline h-3 w-3" />
              <span className="ml-1 text-xs opacity-70">{pt ? "Anexo indisponível" : "Attachment unavailable"}</span>
            </div>
          )}
        </div>
        <div
          className={cn(
            "mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground",
            isInbound ? "justify-start" : "justify-end"
          )}
        >
          {isBot && (
            <Bot className="h-3 w-3" />
          )}
          <span>{formatMessageTime(message.created_at, locale)}</span>
          {!isInbound && (
            <span className="flex items-center gap-0.5">
              {isPending ? (
                <>
                  <Clock className="h-2.5 w-2.5 animate-spin" />
                  <span>{pt ? "Enviando..." : "Sending..."}</span>
                </>
              ) : isFailed ? (
                <>
                  <AlertCircle className="h-2.5 w-2.5 text-destructive" />
                  <span className="text-destructive font-medium">{pt ? "Falhou" : "Failed"}</span>
                </>
              ) : message.status === "delivered" ? (
                <>
                  <CheckCircle className="h-2.5 w-2.5 text-green-600" />
                  <span>{pt ? "Entregue" : "Delivered"}</span>
                </>
              ) : (
                <>
                  <Check className="h-2.5 w-2.5" />
                  <span>{pt ? "Enviado" : "Sent"}</span>
                </>
              )}
            </span>
          )}
        </div>
      </div>

      {!isInbound && !isBot && (
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
          <User className="h-3.5 w-3.5 text-primary" />
        </div>
      )}
      {!isInbound && isBot && (
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Bot className="h-3.5 w-3.5 text-primary" />
        </div>
      )}
    </div>
  );
}

export function MessageThread({
  conversation,
  messages: initialMessages,
}: {
  conversation: Conversation | null;
  messages: Message[];
}) {
  const router = useRouter();
  const { locale } = useLocale();
  const pt = locale === "pt-BR";
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const blobUrlsRef = useRef<Set<string>>(new Set());

  const updateConversationStatus = useCallback(async (status: ConversationStatus) => {
    if (!conversation || statusUpdating) return;
    setStatusUpdating(status);
    try {
      const { error } = await createClient()
        .from("conversations")
        .update({ status })
        .eq("id", conversation.id);
      if (error) throw error;
      router.refresh();
    } catch {
      alert(pt ? "Não foi possível atualizar o status da conversa" : "Failed to update conversation status");
    } finally {
      setStatusUpdating(null);
    }
  }, [conversation, statusUpdating, router, pt]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, []);

  useEffect(() => {
    setMessages((current) => mergeMessages(current, initialMessages));
  }, [initialMessages]);

  // Clean up blob URLs when unmounting
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      blobUrlsRef.current.clear();
    };
  }, []);

  // Auto-scroll to bottom smoothly when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Supabase Realtime Subscription:
  // Listens directly to PostgreSQL changes on the messages table in real time (0ms latency).
  useEffect(() => {
    if (!conversation?.id) return;

    const supabase = createClient();
    const conversationId = conversation.id;

    const channel = supabase
      .channel(`chat-messages-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            // If already present by id or platform_message_id, update it
            const existingIndex = prev.findIndex(
              (m) =>
                m.id === newMsg.id ||
                (newMsg.platform_message_id && m.platform_message_id === newMsg.platform_message_id)
            );

            if (existingIndex >= 0) {
              const updated = [...prev];
              updated[existingIndex] = newMsg;
              return updated;
            }

            // Also check if this matches any recent pending optimistic message
            const optimisticIndex = prev.findIndex(
              (m) =>
                m.id.startsWith("optimistic-") &&
                m.direction === newMsg.direction &&
                m.text === newMsg.text
            );

            if (optimisticIndex >= 0) {
              const updated = [...prev];
              updated[optimisticIndex] = newMsg;
              return updated;
            }

            return [...prev, newMsg];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updatedMsg = payload.new as Message;
          setMessages((prev) =>
            prev.map((m) => (m.id === updatedMsg.id ? updatedMsg : m))
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
          filter: `id=eq.${conversationId}`,
        },
        async () => {
          try {
            const res = await fetch(
              `/api/v1/messages?conversationId=${conversationId}`,
              { cache: "no-store" }
            );
            if (res.ok) {
              const fresh = await res.json();
              if (Array.isArray(fresh)) {
                setMessages((current) => mergeMessages(current, fresh));
              }
            }
          } catch (err) {
            console.error("Failed to sync on conversation update:", err);
          }
        }
      )
      .subscribe();

    const pollInterval = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(
          `/api/v1/messages?conversationId=${conversationId}`,
          { cache: "no-store" }
        );
        if (res.ok) {
          const fresh = await res.json();
          if (Array.isArray(fresh)) {
            setMessages((current) => mergeMessages(current, fresh));
          }
        }
      } catch {
        // Ignore background polling errors
      }
    }, 4000);

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [conversation?.id]);

  async function handleSend() {
    if ((!input.trim() && !selectedFile) || !conversation || sending) return;

    const text = input.trim();
    const file = selectedFile;
    setSendError(null);
    setSending(true);

    const optimisticId = `optimistic-${Date.now()}`;
    let optimisticAttachments: Array<{
      id: string;
      type: string;
      url: string;
      filename: string;
      previewUrl: string | null;
    }> | null = null;

    if (file) {
      const blobUrl = URL.createObjectURL(file);
      blobUrlsRef.current.add(blobUrl);
      const fileType = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
        ? "video"
        : file.type.startsWith("audio/")
        ? "audio"
        : "file";

      optimisticAttachments = [
        {
          id: `opt-att-${Date.now()}`,
          type: fileType,
          url: blobUrl,
          filename: file.name,
          previewUrl: fileType === "image" ? blobUrl : null,
        },
      ];
    }

    // Instant optimistic update with zero lag
    const optimisticMessage: Message = {
      id: optimisticId,
      conversation_id: conversation.id,
      direction: "outbound",
      text: text || null,
      attachments: optimisticAttachments,
      quick_reply_payload: null,
      postback_payload: null,
      callback_data: null,
      platform_message_id: null,
      sent_by_flow_id: null,
      sent_by_node_id: null,
      sent_by_user_id: null,
      status: "pending",
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setInput("");
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      let res: Response;
      if (file) {
        const formData = new FormData();
        formData.set("conversationId", conversation.id);
        if (text) formData.set("text", text);
        formData.set("file", file);
        res = await fetch("/api/v1/messages", {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch("/api/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: conversation.id, text }),
        });
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Send failed (${res.status})`);
      }

      const confirmedMessage: Message = await res.json();
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticId ? confirmedMessage : m))
      );
    } catch (err) {
      console.error("Failed to send message:", err);
      setSendError(err instanceof Error ? err.message : (pt ? "Falha ao enviar" : "Failed to send"));
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticId ? { ...m, status: "failed" as const } : m
        )
      );
    } finally {
      setSending(false);
    }
  }

  if (!conversation) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-background text-center">
        <MessageSquare className="h-12 w-12 text-muted-foreground/30" />
        <h3 className="mt-4 text-sm font-medium text-muted-foreground">
          {pt ? "Selecione uma conversa" : "Select a conversation"}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground/70">
          {pt ? "Escolha uma conversa da lista para ver as mensagens" : "Choose a conversation from the list to view messages"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            {conversation.contacts?.avatar_url ? (
              <img
                src={conversation.contacts.avatar_url}
                alt=""
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium">
                {conversation.contacts?.display_name?.[0]?.toUpperCase() ?? "?"}
              </div>
            )}
            <div className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background bg-background">
              <PlatformIcon
                platform={conversation.platform}
                className="h-2.5 w-2.5"
                size={10}
              />
            </div>
          </div>
          <div>
            <p className="text-sm font-medium">
              {conversation.contacts?.display_name ?? (pt ? "Desconhecido" : "Unknown")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
              conversation.status === "open"
                ? "bg-green-100 text-green-700"
                : conversation.status === "snoozed"
                ? "bg-yellow-100 text-yellow-700"
                : "bg-muted text-muted-foreground"
            )}
          >
            {pt ? ({ open: "aberta", closed: "fechada", snoozed: "pausada" }[conversation.status]) : conversation.status}
          </span>
          {conversation.is_automation_paused && (
            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700">
              {pt ? "Bot pausado" : "Bot paused"}
            </span>
          )}
          <div className="flex items-center gap-1">
            {conversation.status !== "closed" && (
              <button
                onClick={() => updateConversationStatus("closed")}
                disabled={!!statusUpdating}
                title={pt ? "Fechar conversa" : "Close conversation"}
                aria-label={pt ? "Fechar conversa" : "Close conversation"}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
              >
                {statusUpdating === "closed" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
              </button>
            )}
            {conversation.status !== "snoozed" && (
              <button
                onClick={() => updateConversationStatus("snoozed")}
                disabled={!!statusUpdating}
                title={pt ? "Pausar conversa" : "Snooze conversation"}
                aria-label={pt ? "Pausar conversa" : "Snooze conversation"}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
              >
                {statusUpdating === "snoozed" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
              </button>
            )}
            {conversation.status !== "open" && (
              <button
                onClick={() => updateConversationStatus("open")}
                disabled={!!statusUpdating}
                title={pt ? "Reabrir conversa" : "Reopen conversation"}
                aria-label={pt ? "Reabrir conversa" : "Reopen conversation"}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
              >
                {statusUpdating === "open" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.filter(hasRenderableContent).map((message, i, visibleMessages) => (
            <div key={message.id}>
              {shouldShowDateSeparator(message, visibleMessages[i - 1]) && (
                <div className="my-4 flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[11px] text-muted-foreground">
                    {formatDateSeparator(message.created_at, locale, pt ? "Hoje" : "Today", pt ? "Ontem" : "Yesterday")}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              )}
              <MessageBubble message={message} locale={locale} pt={pt} />
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-border p-4">
        <div className="mx-auto max-w-2xl">
          {selectedFile && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
              <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-xs">{selectedFile.name}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                disabled={sending}
                aria-label={pt ? "Remover anexo" : "Remove attachment"}
                className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          {sendError && <p className="mb-2 text-xs text-destructive">{sendError}</p>}
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,audio/mpeg,audio/mp4,audio/ogg,audio/wav,application/pdf,text/plain,.doc,.docx,.xls,.xlsx"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (file && file.size > 25 * 1024 * 1024) {
                  setSendError(pt ? "O anexo deve ter no máximo 25 MB" : "Attachment must be 25 MB or smaller");
                  event.target.value = "";
                  return;
                }
                setSendError(null);
                setSelectedFile(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              aria-label={pt ? "Adicionar anexo" : "Add attachment"}
              title={pt ? "Adicionar anexo" : "Add attachment"}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-input text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <div className="flex-1">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  autoResize();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={pt ? "Digite uma mensagem..." : "Type a message..."}
                rows={1}
                className="w-full resize-none rounded-lg border border-input bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                style={{ maxHeight: 150 }}
              />
            </div>
            <button
              onClick={handleSend}
              disabled={(!input.trim() && !selectedFile) || sending}
              aria-label={pt ? "Enviar mensagem" : "Send message"}
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
                (input.trim() || selectedFile) && !sending
                  ? "bg-primary text-primary-foreground hover:opacity-90"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
