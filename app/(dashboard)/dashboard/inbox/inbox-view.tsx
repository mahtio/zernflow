"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, RefreshCw, User } from "lucide-react";
import { ConversationList } from "@/components/inbox/conversation-list";
import { MessageThread } from "@/components/inbox/message-thread";
import { ContactPanel } from "@/components/inbox/contact-panel";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useLocale } from "@/components/locale-provider";
import type { Database } from "@/lib/types/database";

type Conversation = Database["public"]["Tables"]["conversations"]["Row"] & {
  contacts: Database["public"]["Tables"]["contacts"]["Row"] | null;
};
type Message = Database["public"]["Tables"]["messages"]["Row"];

export function InboxView({
  conversations,
  workspaceId,
}: {
  conversations: Conversation[];
  workspaceId: string;
}) {
  const router = useRouter();
  const { t } = useLocale();
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showContactPanel, setShowContactPanel] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Imports conversations that already exist in Zernio (e.g. from before the
  // webhook was registered), then refreshes the server-rendered list.
  async function handleSyncConversations() {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch("/api/v1/channels/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.error) {
        setSyncError(data.error || t.syncFailed);
        return;
      }
      router.refresh();
    } catch {
      setSyncError(t.syncConnectionFailed);
    } finally {
      setSyncing(false);
    }
  }

  // Keep selected conversation in sync when conversation list updates
  const handleSelect = useCallback((c: Conversation) => {
    setMessages([]);
    setSelected(c);
  }, []);

  const handleConversationUpdate = useCallback((updated: Conversation) => {
    setSelected((current) => current?.id === updated.id ? updated : current);
  }, []);

  // Update selected conversation metadata when server-rendered conversations change.
  useEffect(() => {
    if (!selected) return;
    const found = conversations.find((c) => c.id === selected.id);
    if (found) setSelected(found);
  }, [conversations, selected?.id]);

  // Load messages when a conversation is selected
  useEffect(() => {
    if (!selected) {
      setMessages([]);
      return;
    }

    const conversationId = selected.id;
    const unreadCount = selected.unread_count;
    let cancelled = false;

    async function loadMessages() {
      setLoadingMessages(true);
      try {
        const res = await fetch(
          `/api/v1/messages?conversationId=${conversationId}`,
          { cache: "no-store" }
        );
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setMessages(Array.isArray(data) ? data : []);
        } else {
          console.error("Failed to load messages:", res.status);
          setMessages([]);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load messages:", err);
        setMessages([]);
      } finally {
        if (!cancelled) setLoadingMessages(false);
      }

      // Mark as read
      if (unreadCount > 0) {
        const supabase = createClient();
        await supabase
          .from("conversations")
          .update({ unread_count: 0 })
          .eq("id", conversationId);
      }
    }

    loadMessages();
    return () => {
      cancelled = true;
    };
  }, [selected?.id]);

  return (
    <div className="flex h-full">
      {/* Left panel: Conversation list */}
      <div className="w-80 flex-shrink-0">
        <ConversationList
          conversations={conversations}
          workspaceId={workspaceId}
          selectedId={selected?.id ?? null}
          onSelect={handleSelect}
          onConversationUpdate={handleConversationUpdate}
        />
      </div>

      {/* Center panel: Message thread */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Toggle contact panel button */}
        {selected && !showContactPanel && (
          <div className="flex shrink-0 justify-end border-b border-border px-2 py-1">
            <button
              onClick={() => setShowContactPanel(true)}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label={t.contactInfo}
            >
              <User className="h-3.5 w-3.5" />
              {t.contactInfo}
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1">
          {conversations.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <MessageSquare className="h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">
                {t.noConversationsYet}
              </p>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground/70">
                {t.inboxEmptyDescription}
              </p>
              <button
                onClick={handleSyncConversations}
                disabled={syncing}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
              >
                <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
                {syncing ? t.syncing : t.syncConversations}
              </button>
              {syncError && (
                <p className="mt-2 text-xs text-destructive">{syncError}</p>
              )}
            </div>
          ) : (
            <div className="relative h-full">
              <MessageThread
                key={selected?.id ?? "empty"}
                conversation={selected}
                messages={messages}
              />
              {loadingMessages && selected && messages.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-background">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right panel: Contact info */}
      {showContactPanel && selected?.contact_id && (
        <ContactPanel
          contactId={selected.contact_id}
          workspaceId={workspaceId}
          onClose={() => setShowContactPanel(false)}
        />
      )}
    </div>
  );
}
