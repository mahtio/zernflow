"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Mail,
  Calendar,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { PlatformIcon } from "@/components/platform-icon";
import { useLocale } from "@/components/locale-provider";

interface ContactDetailViewProps {
  contact: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    email: string | null;
    last_interaction_at: string | null;
    is_subscribed: boolean | null;
  };
  tags: Array<{ id: string; name: string; color: string | null }>;
  channels: Array<{
    id: string;
    platform_username: string | null;
    platform_sender_id: string;
    channels: {
      platform?: string | null;
      display_name?: string | null;
      username?: string | null;
    } | null;
  }>;
  conversations: Array<{
    id: string;
    platform: string;
    status: string;
    last_message_at: string | null;
    last_message_preview: string | null;
  }>;
  customFields: Array<{
    value: string | null;
    custom_field_definitions: {
      name?: string;
      slug?: string;
      type?: string;
    } | null;
  }>;
}

export function ContactDetailView({
  contact,
  tags,
  channels,
  conversations,
  customFields,
}: ContactDetailViewProps) {
  const { locale } = useLocale();
  const pt = locale === "pt-BR";

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return pt ? "Nunca" : "Never";
    return new Date(dateStr).toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const conversationStatusLabels: Record<string, string> = {
    open: pt ? "aberta" : "open",
    closed: pt ? "fechada" : "closed",
    archived: pt ? "arquivada" : "archived",
    pending: pt ? "pendente" : "pending",
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-8 py-6">
        <Link
          href="/dashboard/contacts"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {pt ? "Voltar para contatos" : "Back to contacts"}
        </Link>
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold">
            {contact.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={contact.avatar_url}
                alt={contact.display_name || (pt ? "Contato" : "Contact")}
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              contact.display_name?.[0]?.toUpperCase() ?? "?"
            )}
          </div>
          <div>
            <h1 className="text-xl font-bold">
              {contact.display_name ?? (pt ? "Desconhecido" : "Unknown")}
            </h1>
            <div className="mt-0.5 flex items-center gap-3 text-sm text-muted-foreground">
              {contact.email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {contact.email}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {pt ? "Última atividade" : "Last active"} {formatDate(contact.last_interaction_at)}
              </span>
              {contact.is_subscribed ? (
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle className="h-3 w-3" />
                  {pt ? "Inscrito" : "Subscribed"}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <XCircle className="h-3 w-3" />
                  {pt ? "Não inscrito" : "Unsubscribed"}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex rounded-full border border-border px-2.5 py-0.5 text-xs font-medium"
                style={
                  tag.color
                    ? {
                        backgroundColor: `${tag.color}20`,
                        borderColor: `${tag.color}40`,
                        color: tag.color,
                      }
                    : undefined
                }
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Connected channels */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
              {pt ? "Canais conectados" : "Connected Channels"}
            </h2>
            {channels.length === 0 ? (
              <p className="text-sm text-muted-foreground/60">{pt ? "Nenhum canal" : "No channels"}</p>
            ) : (
              <div className="space-y-2">
                {channels.map((cc) => {
                  const ch = cc.channels;
                  return (
                    <div
                      key={cc.id}
                      className="flex items-center gap-3 rounded-lg border border-border p-3"
                    >
                      <PlatformIcon
                        platform={ch?.platform ?? ""}
                        className="h-4 w-4"
                        size={16}
                      />
                      <div>
                        <p className="text-sm font-medium">
                          {ch?.display_name ?? ch?.username ?? (pt ? "Desconhecido" : "Unknown")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {ch?.platform} ·{" "}
                          {cc.platform_username
                            ? `@${cc.platform_username}`
                            : cc.platform_sender_id}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Conversations */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
              {pt ? "Conversas" : "Conversations"}
            </h2>
            {conversations.length === 0 ? (
              <p className="text-sm text-muted-foreground/60">
                {pt ? "Nenhuma conversa" : "No conversations"}
              </p>
            ) : (
              <div className="space-y-2">
                {conversations.map((conv) => (
                  <Link
                    key={conv.id}
                    href="/dashboard/inbox"
                    className="flex items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent/50"
                  >
                    <PlatformIcon
                      platform={conv.platform}
                      className="mt-0.5 h-4 w-4"
                      size={16}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium capitalize text-muted-foreground">
                          {conv.platform} · {conversationStatusLabels[conv.status] ?? conv.status}
                        </p>
                        <p className="text-[10px] text-muted-foreground/60">
                          {formatDate(conv.last_message_at)}
                        </p>
                      </div>
                      <p className="mt-0.5 truncate text-sm">
                        {conv.last_message_preview || (pt ? "Sem mensagens" : "No messages")}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Custom fields */}
          {customFields.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
                {pt ? "Campos personalizados" : "Custom Fields"}
              </h2>
              <div className="space-y-2">
                {customFields.map((cf, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-border p-3"
                  >
                    <span className="text-sm text-muted-foreground">
                      {cf.custom_field_definitions?.name ?? (pt ? "Campo" : "Field")}
                    </span>
                    <span className="text-sm font-medium">{cf.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
