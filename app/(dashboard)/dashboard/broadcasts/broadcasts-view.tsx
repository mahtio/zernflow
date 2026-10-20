"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Radio,
  Plus,
  Clock,
  CheckCircle2,
  Send,
  Loader2,
  XCircle,
  FileEdit,
  Calendar,
  Filter,
  ChevronDown,
  ArrowLeft,
  AlertCircle,
  Users,
  Play,
  Pause,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/components/locale-provider";
import {
  SegmentBuilder,
  createEmptyFilter,
  type SegmentFilter,
} from "@/components/segment-builder";
import type { Database, BroadcastStatus, Json } from "@/lib/types/database";

type Broadcast = Database["public"]["Tables"]["broadcasts"]["Row"];

const statusConfig: Record<
  BroadcastStatus,
  { label: string; icon: React.ElementType; className: string }
> = {
  draft: {
    label: "Draft",
    icon: FileEdit,
    className: "bg-muted text-muted-foreground",
  },
  scheduled: {
    label: "Scheduled",
    icon: Clock,
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  sending: {
    label: "Sending",
    icon: Loader2,
    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Not scheduled";
  return new Date(dateStr).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BroadcastsView({
  broadcasts,
  workspaceId,
}: {
  broadcasts: Broadcast[];
  workspaceId: string;
}) {
  const { locale } = useLocale();
  const pt = locale === "pt-BR";
  const statusLabels: Record<BroadcastStatus, string> = pt
    ? { draft: "Rascunho", scheduled: "Agendada", sending: "Enviando", completed: "Concluída", cancelled: "Cancelada" }
    : { draft: "Draft", scheduled: "Scheduled", sending: "Sending", completed: "Completed", cancelled: "Cancelled" };
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [items, setItems] = useState(broadcasts);
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>(
    createEmptyFilter()
  );
  const [showSegmentFilter, setShowSegmentFilter] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function handleCreate() {
    if (!newName.trim() || creating) return;
    setCreating(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("broadcasts")
        .insert({
          workspace_id: workspaceId,
          name: newName.trim(),
          status: "draft",
          message_content: {},
          segment_filter: showSegmentFilter
            ? (segmentFilter as unknown as Json)
            : null,
        })
        .select()
        .single();

      if (error) throw error;
      if (data) {
        setItems((prev) => [data, ...prev]);
        setNewName("");
        setShowCreate(false);
        setSelectedId(data.id);
      }
    } catch (err) {
      console.error("Failed to create broadcast:", err);
    } finally {
      setCreating(false);
    }
  }

  const selectedBroadcast = selectedId
    ? items.find((b) => b.id === selectedId) ?? null
    : null;

  if (selectedBroadcast) {
    return (
      <BroadcastDetail
        broadcast={selectedBroadcast}
        workspaceId={workspaceId}
        onBack={() => setSelectedId(null)}
        onUpdate={(updated) => {
          setItems((prev) =>
            prev.map((b) => (b.id === updated.id ? updated : b))
          );
        }}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{pt ? "Transmissões" : "Broadcasts"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {pt ? "Envie mensagens para vários contatos ao mesmo tempo" : "Send messages to multiple contacts at once"}
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            {pt ? "Criar transmissão" : "Create Broadcast"}
          </button>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="mt-4 rounded-lg border border-border bg-card p-4 space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder={pt ? "Nome da transmissão..." : "Broadcast name..."}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !showSegmentFilter) handleCreate();
                  if (e.key === "Escape") setShowCreate(false);
                }}
                autoFocus
                className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || creating}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {creating ? (pt ? "Criando..." : "Creating...") : (pt ? "Criar" : "Create")}
              </button>
              <button
                onClick={() => {
                  setShowCreate(false);
                  setNewName("");
                  setShowSegmentFilter(false);
                  setSegmentFilter(createEmptyFilter());
                }}
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
              >
                {pt ? "Cancelar" : "Cancel"}
              </button>
            </div>

            {/* Targeting section */}
            <div>
              <button
                type="button"
                onClick={() => setShowSegmentFilter(!showSegmentFilter)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  showSegmentFilter
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-input text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Filter className="h-3.5 w-3.5" />
                {pt ? "Selecionar contatos específicos" : "Target specific contacts"}
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform",
                    showSegmentFilter && "rotate-180"
                  )}
                />
              </button>

              {showSegmentFilter && (
                <div className="mt-3">
                  <SegmentBuilder
                    value={segmentFilter}
                    onChange={setSegmentFilter}
                    workspaceId={workspaceId}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Broadcast list */}
      <div className="flex-1 overflow-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Radio className="h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm font-medium text-muted-foreground">
              {pt ? "Ainda não há transmissões" : "No broadcasts yet"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              {pt ? "Crie sua primeira transmissão para enviar mensagens aos seus contatos" : "Create your first broadcast to send messages to your contacts"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((broadcast) => {
              const status = statusConfig[broadcast.status];
              const StatusIcon = status.icon;
              const total = broadcast.total_recipients;

              return (
                <button
                  key={broadcast.id}
                  onClick={() => setSelectedId(broadcast.id)}
                  className="flex w-full items-center gap-6 px-8 py-4 text-left transition-colors hover:bg-accent/50"
                >
                  {/* Status + Name */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="truncate text-sm font-medium">
                        {broadcast.name}
                      </h3>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                          status.className
                        )}
                      >
                        <StatusIcon
                          className={cn(
                            "h-3 w-3",
                            broadcast.status === "sending" && "animate-spin"
                          )}
                        />
                        {statusLabels[broadcast.status]}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {broadcast.scheduled_for
                          ? formatDate(broadcast.scheduled_for)
                          : (pt ? "Não agendada" : "Not scheduled")}
                      </span>
                      <span>
                        {pt ? "Criada em" : "Created"} {formatDate(broadcast.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <p className="text-lg font-semibold">
                        {broadcast.status === "draft" && total === 0 ? "—" : total}
                      </p>
                      <p className="text-[10px] uppercase text-muted-foreground">
                        {pt ? "Destinatários" : "Recipients"}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold text-green-600">
                        {broadcast.sent}
                      </p>
                      <p className="text-[10px] uppercase text-muted-foreground">
                        {pt ? "Enviadas" : "Sent"}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold text-blue-600">
                        {broadcast.delivered}
                      </p>
                      <p className="text-[10px] uppercase text-muted-foreground">
                        {pt ? "Entregues" : "Delivered"}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold text-red-600">
                        {broadcast.failed}
                      </p>
                      <p className="text-[10px] uppercase text-muted-foreground">
                        {pt ? "Falhas" : "Failed"}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface Audience {
  matched: number;
  reachable: number;
}

/** Live audience size for a draft: how many contacts the filter resolves to. */
function useAudience(broadcastId: string, enabled: boolean) {
  const [audience, setAudience] = useState<Audience | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetch("/api/v1/broadcasts/audience", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ broadcastId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load audience");
        if (!cancelled) setAudience(data as Audience);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load audience");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [broadcastId, enabled]);

  return { audience, loading, error };
}

/**
 * Drains the job queue from the browser while a broadcast is sending.
 * Deliveries run in the queue worker, which needs an external trigger; until a
 * cron is wired up this panel is that trigger, and it also gives live progress.
 */
function QueueRunner({
  broadcast,
  onUpdate,
}: {
  broadcast: Broadcast;
  onUpdate: (updated: Broadcast) => void;
}) {
  const { locale } = useLocale();
  const pt = locale === "pt-BR";
  const [running, setRunning] = useState(false);
  const [unfinished, setUnfinished] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef(false);
  const startedRef = useRef(false);

  // Kept in a ref: the parent passes a fresh closure on every render, and
  // depending on it directly would re-trigger the effects below in a loop.
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const [{ data: row }, { count }] = await Promise.all([
      supabase.from("broadcasts").select("*").eq("id", broadcast.id).maybeSingle(),
      supabase
        .from("broadcast_recipients")
        .select("id", { count: "exact", head: true })
        .eq("broadcast_id", broadcast.id)
        .in("status", ["pending", "sending"]),
    ]);
    if (row) onUpdateRef.current(row);
    setUnfinished(count ?? 0);
  }, [broadcast.id]);

  const run = useCallback(async () => {
    stopRef.current = false;
    setRunning(true);
    setError(null);
    try {
      // Bounded so a worker that keeps returning due jobs cannot loop forever.
      for (let i = 0; i < 1000; i++) {
        if (stopRef.current) break;

        const res = await fetch("/api/cron/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 25 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to process queue");

        await refresh();
        if (data.total === 0) break;
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to process queue"
      );
    } finally {
      setRunning(false);
    }
  }, [refresh]);

  // Start as soon as the broadcast is opened: the send was already confirmed,
  // so the only thing missing is someone turning the crank. No unmount
  // cleanup on purpose — Strict Mode's double-invoke would stop the drain
  // right after its first batch, and letting an open run finish is harmless
  // (claims are CAS-guarded, so a second runner cannot double-send).
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    run();
  }, [run]);

  const sent = broadcast.sent;
  const failed = broadcast.failed;
  const total = broadcast.total_recipients;
  const done = total > 0 ? Math.round(((sent + failed) / total) * 100) : 0;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {running ? (
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
          ) : (
            <Send className="h-5 w-5 shrink-0 text-muted-foreground" />
          )}
          <div>
            <p className="text-sm font-medium">
              {running
                ? pt
                  ? "Processando a fila de envio..."
                  : "Processing the delivery queue..."
                : pt
                  ? "Fila de envio pausada"
                  : "Delivery queue paused"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {pt
                ? `${sent + failed} de ${total} processados · ${unfinished ?? "…"} restantes`
                : `${sent + failed} of ${total} processed · ${unfinished ?? "…"} remaining`}
            </p>
          </div>
        </div>

        {running ? (
          <button
            onClick={() => {
              stopRef.current = true;
            }}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            <Pause className="h-4 w-4" />
            {pt ? "Pausar" : "Pause"}
          </button>
        ) : (
          <button
            onClick={run}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Play className="h-4 w-4" />
            {pt ? "Continuar" : "Resume"}
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${done}%` }}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {pt
          ? "Mantenha esta página aberta até terminar. Contatos sem conversa sincronizada na caixa de entrada são contados como falha, porque o Zernio só entrega dentro de uma conversa existente."
          : "Keep this page open until it finishes. Contacts without a synced inbox conversation are counted as failures, because Zernio can only deliver into an existing conversation."}
      </p>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}

function BroadcastDetail({
  broadcast,
  workspaceId,
  onBack,
  onUpdate,
}: {
  broadcast: Broadcast;
  workspaceId: string;
  onBack: () => void;
  onUpdate: (updated: Broadcast) => void;
}) {
  const { locale } = useLocale();
  const pt = locale === "pt-BR";
  const messageContent = broadcast.message_content as { text?: string } | null;
  const [messageText, setMessageText] = useState(messageContent?.text || "");
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryInfo, setRetryInfo] = useState<string | null>(null);
  // Bumped after a retry so the queue runner remounts and starts draining the
  // newly queued jobs instead of sitting on its already-finished loop.
  const [queueNonce, setQueueNonce] = useState(0);

  const isDraft = broadcast.status === "draft" || broadcast.status === "scheduled";
  const status = statusConfig[broadcast.status];
  const statusLabel = pt
    ? { draft: "Rascunho", scheduled: "Agendada", sending: "Enviando", completed: "Concluída", cancelled: "Cancelada" }[broadcast.status]
    : status.label;
  const StatusIcon = status.icon;
  const { audience, loading: audienceLoading } = useAudience(
    broadcast.id,
    isDraft
  );

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const newContent = { text: messageText.trim() };
      const { data, error: err } = await supabase
        .from("broadcasts")
        .update({ message_content: newContent as unknown as Json })
        .eq("id", broadcast.id)
        .select()
        .single();

      if (err) throw err;
      if (data) onUpdate(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleRetryUnreachable() {
    setRetrying(true);
    setError(null);
    setRetryInfo(null);

    try {
      const res = await fetch(
        `/api/v1/broadcasts/${broadcast.id}/retry-unreachable`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to retry");

      setRetryInfo(
        pt
          ? `${data.conversationsLinked} conversas vinculadas, ${data.conversationsImported} importadas · ${data.requeued} destinatários reenfileirados${
              data.stillUnreachable
                ? ` · ${data.stillUnreachable} seguem sem conversa`
                : ""
            }`
          : `${data.conversationsLinked} conversations linked, ${data.conversationsImported} imported · ${data.requeued} recipients re-queued${
              data.stillUnreachable
                ? ` · ${data.stillUnreachable} still have no conversation`
                : ""
            }`
      );

      const supabase = createClient();
      const { data: row } = await supabase
        .from("broadcasts")
        .select("*")
        .eq("id", broadcast.id)
        .maybeSingle();
      if (row) onUpdate(row);

      if (data.requeued > 0) setQueueNonce((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to retry");
    } finally {
      setRetrying(false);
    }
  }

  async function handleSend() {
    if (!messageText.trim()) {
      setError(pt ? "A mensagem não pode ficar vazia" : "Message cannot be empty");
      return;
    }

    setSending(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/v1/broadcasts/${broadcast.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageContent: { text: messageText.trim() },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send broadcast");
      }

      setSuccess(pt ? `Enviando para ${data.totalRecipients} destinatários` : `Sending to ${data.totalRecipients} recipients`);

      // Update the broadcast locally
      onUpdate({
        ...broadcast,
        status: "sending",
        total_recipients: data.totalRecipients,
        message_content: { text: messageText.trim() } as unknown as Json,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-8 py-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{broadcast.name}</h1>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                  status.className
                )}
              >
                <StatusIcon
                  className={cn(
                    "h-3.5 w-3.5",
                    broadcast.status === "sending" && "animate-spin"
                  )}
                />
                {statusLabel}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {pt ? "Criada em" : "Created"} {formatDate(broadcast.created_at)}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Stats row for non-draft broadcasts */}
          {broadcast.total_recipients > 0 && (
            <div className="grid grid-cols-4 gap-4">
              <div className="rounded-lg border border-border bg-card p-4 text-center">
                <p className="text-2xl font-bold">{broadcast.total_recipients}</p>
                <p className="text-xs text-muted-foreground">{pt ? "Destinatários" : "Recipients"}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{broadcast.sent}</p>
                <p className="text-xs text-muted-foreground">{pt ? "Enviadas" : "Sent"}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">{broadcast.delivered}</p>
                <p className="text-xs text-muted-foreground">{pt ? "Entregues" : "Delivered"}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4 text-center">
                <p className="text-2xl font-bold text-red-600">{broadcast.failed}</p>
                <p className="text-xs text-muted-foreground">{pt ? "Falhas" : "Failed"}</p>
              </div>
            </div>
          )}

          {/* Live queue drain while the broadcast is sending */}
          {broadcast.status === "sending" && (
            <QueueRunner
              key={queueNonce}
              broadcast={broadcast}
              onUpdate={onUpdate}
            />
          )}

          {/* Recover recipients that failed for a missing conversation */}
          {!isDraft && broadcast.failed > 0 && (
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">
                    {pt
                      ? `${broadcast.failed} destinatários falharam`
                      : `${broadcast.failed} recipients failed`}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {pt
                      ? "Contatos vindos de comentários têm conversa criada antes do DM existir, então ficam sem o identificador do Zernio. Sincronize a caixa de entrada para vincular e reenviar — a mensagem salva é reaproveitada sem alteração."
                      : "Contacts coming from comments get a conversation before any DM exists, so they carry no Zernio id. Sync the inbox to link them and retry — the saved message is reused unchanged."}
                  </p>
                </div>
                <button
                  onClick={handleRetryUnreachable}
                  disabled={retrying}
                  className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
                >
                  <RefreshCw
                    className={cn("h-4 w-4", retrying && "animate-spin")}
                  />
                  {retrying
                    ? pt
                      ? "Sincronizando..."
                      : "Syncing..."
                    : pt
                      ? "Sincronizar e reenviar"
                      : "Sync and retry"}
                </button>
              </div>

              {retryInfo && (
                <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700 dark:border-green-900/50 dark:bg-green-900/20 dark:text-green-400">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {retryInfo}
                </div>
              )}
            </div>
          )}

          {/* Audience preview for drafts */}
          {isDraft && (
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 shrink-0 text-muted-foreground" />
                {audienceLoading ? (
                  <p className="text-sm text-muted-foreground">
                    {pt ? "Calculando audiência..." : "Calculating audience..."}
                  </p>
                ) : audience ? (
                  <div>
                    <p className="text-sm font-medium">
                      {pt
                        ? `${audience.reachable} contatos receberão esta transmissão`
                        : `${audience.reachable} contacts will receive this broadcast`}
                    </p>
                    {audience.matched !== audience.reachable && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {pt
                          ? `${audience.matched} contatos correspondem ao filtro, mas ${audience.matched - audience.reachable} não têm um canal conectado.`
                          : `${audience.matched} contacts match the filter, but ${audience.matched - audience.reachable} have no connected channel.`}
                      </p>
                    )}
                    {audience.reachable === 0 && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {pt
                          ? "Ajuste o filtro de segmento ou conecte um canal para poder enviar."
                          : "Adjust the segment filter or connect a channel to be able to send."}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {pt
                      ? "Não foi possível calcular a audiência."
                      : "Could not calculate the audience."}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Message composer */}
          <div className="space-y-3">
            <label className="text-sm font-medium">{pt ? "Mensagem" : "Message"}</label>
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              disabled={!isDraft}
              placeholder={pt ? "Digite aqui a mensagem da transmissão..." : "Type your broadcast message here..."}
              rows={6}
              className="w-full rounded-lg border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            />
            {isDraft && (
              <p className="text-xs text-muted-foreground">
                {pt
                  ? `Esta mensagem será enviada a todos os contatos que correspondem ao filtro do segmento${broadcast.segment_filter ? "" : " (todos os contatos inscritos)"}.`
                  : `This message will be sent to all contacts matching your segment filter${broadcast.segment_filter ? "" : " (all subscribed contacts)"}.`}
              </p>
            )}
          </div>

          {/* Segment info */}
          {broadcast.segment_filter && (
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Filter className="h-4 w-4 text-muted-foreground" />
                {pt ? "Filtro de segmento aplicado" : "Segment filter applied"}
              </div>
              <pre className="mt-2 overflow-auto rounded bg-muted p-3 text-xs text-muted-foreground">
                {JSON.stringify(broadcast.segment_filter, null, 2)}
              </pre>
            </div>
          )}

          {/* Error/Success messages */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-900/50 dark:bg-green-900/20 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {success}
            </div>
          )}

          {/* Actions */}
          {isDraft && (
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleSend}
                disabled={
                  sending || !messageText.trim() || audience?.reachable === 0
                }
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {sending ? (pt ? "Enviando..." : "Sending...") : (pt ? "Enviar agora" : "Send Now")}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !messageText.trim()}
                className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
              >
                {saving ? (pt ? "Salvando..." : "Saving...") : (pt ? "Salvar rascunho" : "Save Draft")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
