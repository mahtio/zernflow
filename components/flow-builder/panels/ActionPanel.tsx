"use client";

import { useCallback, useState, type FormEvent } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/components/locale-provider";
import type { NodeType } from "@/lib/types/database";
import { EnrollSequencePanel } from "./EnrollSequencePanel";

interface ActionPanelData {
  actionType?: NodeType;
  tagName?: string;
  action?: "add" | "remove";
  fieldSlug?: string;
  value?: string;
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
  responseVariable?: string;
  flowId?: string;
  returnAfter?: boolean;
  message?: string;
  paths?: Array<{ name: string; weight: number }>;
  timeout?: number;
  timeoutUnit?: string;
  confirmed?: boolean;
  sequenceId?: string;
  [key: string]: unknown;
}

interface CustomFieldOption {
  id: string;
  name: string;
  slug: string;
}

interface ActionPanelProps {
  data: Record<string, unknown>;
  workspaceId: string;
  customFields: CustomFieldOption[];
  onCustomFieldCreated: (field: CustomFieldOption) => void;
  onChange: (data: Record<string, unknown>) => void;
}

interface ActionSubPanelProps {
  data: ActionPanelData;
  onChange: (data: Record<string, unknown>) => void;
}

export function ActionPanel({
  data: rawData,
  workspaceId,
  customFields,
  onCustomFieldCreated,
  onChange,
}: ActionPanelProps) {
  const { locale } = useLocale();
  const pt = locale === "pt-BR";
  const data = rawData as ActionPanelData;
  const actionType = data.actionType || "addTag";

  switch (actionType) {
    case "addTag":
    case "removeTag":
      return <TagConfig data={data} onChange={onChange} />;
    case "setCustomField":
      return (
        <SetFieldConfig
          data={data}
          workspaceId={workspaceId}
          customFields={customFields}
          onCustomFieldCreated={onCustomFieldCreated}
          onChange={onChange}
        />
      );
    case "httpRequest":
      return <HttpRequestConfig data={data} onChange={onChange} />;
    case "goToFlow":
      return <GoToFlowConfig data={data} onChange={onChange} />;
    case "subscribe":
    case "unsubscribe":
      return <SubscribeConfig data={data} onChange={onChange} />;
    case "humanTakeover":
      return <HumanTakeoverConfig data={data} onChange={onChange} />;
    case "abSplit":
      return <ABSplitConfig data={data} onChange={onChange} />;
    case "smartDelay":
      return <SmartDelayConfig data={data} onChange={onChange} />;
    case "enrollSequence":
      return <EnrollSequencePanel data={rawData} onChange={onChange} />;
    default:
      return (
        <p className="text-sm text-muted-foreground">
          {pt ? "Não há configuração disponível para este tipo de ação." : "No configuration available for this action type."}
        </p>
      );
  }
}

/* ───────── Tag Config ───────── */
function TagConfig({ data, onChange }: ActionSubPanelProps) {
  const { locale } = useLocale();
  const pt = locale === "pt-BR";
  const isAdd = data.actionType === "addTag";

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-xs font-semibold text-foreground">
          {pt ? "Nome da etiqueta" : "Tag Name"}
        </label>
        <input
          type="text"
          value={data.tagName || ""}
          onChange={(e) => onChange({ ...data, tagName: e.target.value })}
          placeholder={pt ? "Digite o nome da etiqueta..." : "Enter tag name..."}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          {isAdd
            ? (pt ? "Esta etiqueta será adicionada ao contato quando ele alcançar esta etapa." : "This tag will be added to the contact when they reach this step.")
            : (pt ? "Esta etiqueta será removida do contato quando ele alcançar esta etapa." : "This tag will be removed from the contact when they reach this step.")}
        </p>
      </div>
    </div>
  );
}

/* ───────── Set Custom Field Config ───────── */
type CustomFieldType = "text" | "number" | "boolean" | "date" | "url" | "email";

function createFieldSlug(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function SetFieldConfig({
  data,
  workspaceId,
  customFields,
  onCustomFieldCreated,
  onChange,
}: ActionSubPanelProps & {
  workspaceId: string;
  customFields: CustomFieldOption[];
  onCustomFieldCreated: (field: CustomFieldOption) => void;
}) {
  const { locale } = useLocale();
  const pt = locale === "pt-BR";
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] = useState<CustomFieldType>("text");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const customFieldTypes: Array<{ value: CustomFieldType; label: string }> = [
    { value: "text", label: pt ? "Texto" : "Text" },
    { value: "number", label: pt ? "Número" : "Number" },
    { value: "boolean", label: pt ? "Sim / Não" : "Yes / No" },
    { value: "date", label: pt ? "Data" : "Date" },
    { value: "url", label: "URL" },
    { value: "email", label: pt ? "E-mail" : "Email" },
  ];

  const selectedFieldExists = customFields.some(
    (field) => field.slug === data.fieldSlug
  );
  const fieldSlug = createFieldSlug(fieldName);

  function closeCreateModal() {
    if (creating) return;
    setShowCreateModal(false);
    setFieldName("");
    setFieldType("text");
    setCreateError(null);
  }

  async function handleCreateField(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fieldName.trim() || !fieldSlug) return;

    setCreating(true);
    setCreateError(null);

    const supabase = createClient();
    const { data: createdField, error } = await supabase
      .from("custom_field_definitions")
      .insert({
        workspace_id: workspaceId,
        name: fieldName.trim(),
        slug: fieldSlug,
        type: fieldType,
      })
      .select("id, name, slug")
      .single();

    if (error || !createdField) {
      setCreateError(
        error?.code === "23505"
          ? (pt ? "Já existe um campo personalizado com este nome." : "A custom field with this name already exists.")
          : error?.message || (pt ? "Não foi possível criar o campo personalizado." : "Could not create the custom field.")
      );
      setCreating(false);
      return;
    }

    onCustomFieldCreated(createdField);
    onChange({ ...data, fieldSlug: createdField.slug });
    setCreating(false);
    setShowCreateModal(false);
    setFieldName("");
    setFieldType("text");
    setCreateError(null);
  }

  return (
    <>
      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-xs font-semibold text-foreground">
            {pt ? "Campo personalizado" : "Custom Field"}
          </label>
          <select
            value={data.fieldSlug || ""}
            onChange={(e) => {
              if (e.target.value === "__add_field__") {
                setShowCreateModal(true);
                return;
              }
              onChange({ ...data, fieldSlug: e.target.value });
            }}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">{pt ? "Selecione um campo personalizado" : "Select a custom field"}</option>
            {data.fieldSlug && !selectedFieldExists && (
              <option value={data.fieldSlug}>{data.fieldSlug} ({pt ? "não encontrado" : "not found"})</option>
            )}
            {customFields.map((field) => (
              <option key={field.id} value={field.slug}>
                {field.name} ({field.slug})
              </option>
            ))}
            <option value="__add_field__">{pt ? "+ Adicionar campo personalizado" : "+ Add custom field"}</option>
          </select>
        </div>
        <div>
          <label className="mb-2 block text-xs font-semibold text-foreground">
            {pt ? "Valor" : "Value"}
          </label>
          <input
            type="text"
            value={data.value || ""}
            onChange={(e) => onChange({ ...data, value: e.target.value })}
            placeholder={pt ? "Valor ou {{variavel}}" : "Value or {{variable}}"}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground/60">
            {pt ? "Use {{variavel}} para valores dinâmicos" : "Use {{variable}} for dynamic values"}
          </p>
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label={pt ? "Fechar modal" : "Close modal"}
            className="absolute inset-0 bg-black/60"
            onClick={closeCreateModal}
          />
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-custom-field-title"
            onSubmit={handleCreateField}
            className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3
                  id="create-custom-field-title"
                  className="text-base font-semibold text-foreground"
                >
                  {pt ? "Adicionar campo personalizado" : "Add custom field"}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {pt ? "Crie um campo e selecione o tipo de dado que ele armazenará." : "Create a field and select the kind of value it stores."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeCreateModal}
                disabled={creating}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-xs font-semibold text-foreground">
                  {pt ? "Nome do campo" : "Field name"}
                </label>
                <input
                  autoFocus
                  type="text"
                  value={fieldName}
                  onChange={(e) => setFieldName(e.target.value)}
                  placeholder={pt ? "Ex: Cidade de nascimento" : "e.g. Birth city"}
                  disabled={creating}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
                />
                {fieldSlug && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Slug: {fieldSlug}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold text-foreground">
                  {pt ? "Tipo do campo" : "Field type"}
                </label>
                <select
                  value={fieldType}
                  onChange={(e) => setFieldType(e.target.value as CustomFieldType)}
                  disabled={creating}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
                >
                  {customFieldTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              {createError && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {createError}
                </p>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeCreateModal}
                disabled={creating}
                className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
              >
                {pt ? "Cancelar" : "Cancel"}
              </button>
              <button
                type="submit"
                disabled={creating || !fieldName.trim() || !fieldSlug}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                {pt ? "Adicionar campo" : "Add field"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

/* ───────── HTTP Request Config ───────── */
function HttpRequestConfig({ data, onChange }: ActionSubPanelProps) {
  const { locale } = useLocale();
  const pt = locale === "pt-BR";
  const headers = data.headers || {};
  const headerEntries = Object.entries(headers);

  const addHeader = useCallback(() => {
    onChange({ ...data, headers: { ...headers, "": "" } });
  }, [data, headers, onChange]);

  const updateHeaderKey = useCallback(
    (oldKey: string, newKey: string) => {
      const newHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(headers)) {
        newHeaders[k === oldKey ? newKey : k] = v;
      }
      onChange({ ...data, headers: newHeaders });
    },
    [data, headers, onChange]
  );

  const updateHeaderValue = useCallback(
    (key: string, value: string) => {
      onChange({ ...data, headers: { ...headers, [key]: value } });
    },
    [data, headers, onChange]
  );

  const removeHeader = useCallback(
    (key: string) => {
      const newHeaders = { ...headers };
      delete newHeaders[key];
      onChange({ ...data, headers: Object.keys(newHeaders).length > 0 ? newHeaders : undefined });
    },
    [data, headers, onChange]
  );

  return (
    <div className="space-y-4">
      {/* Method + URL */}
      <div>
        <label className="mb-2 block text-xs font-semibold text-foreground">
          {pt ? "Requisição" : "Request"}
        </label>
        <div className="flex gap-2">
          <select
            value={data.method || "GET"}
            onChange={(e) => onChange({ ...data, method: e.target.value })}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
          </select>
          <input
            type="url"
            value={data.url || ""}
            onChange={(e) => onChange({ ...data, url: e.target.value })}
            placeholder="https://api.example.com/webhook"
            className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Headers */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs font-semibold text-foreground">{pt ? "Cabeçalhos (Headers)" : "Headers"}</label>
          <button
            type="button"
            onClick={addHeader}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted"
          >
            <Plus className="h-3 w-3" />
            {pt ? "Adicionar" : "Add"}
          </button>
        </div>
        {headerEntries.map(([key, value], i) => (
          <div key={i} className="mb-2 flex items-center gap-2">
            <input
              type="text"
              value={key}
              onChange={(e) => updateHeaderKey(key, e.target.value)}
              placeholder={pt ? "Chave" : "Key"}
              className="flex-1 rounded border border-border bg-card px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <input
              type="text"
              value={value}
              onChange={(e) => updateHeaderValue(key, e.target.value)}
              placeholder={pt ? "Valor" : "Value"}
              className="flex-1 rounded border border-border bg-card px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              type="button"
              onClick={() => removeHeader(key)}
              className="rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Body */}
      {(data.method === "POST" || data.method === "PUT") && (
        <div>
          <label className="mb-2 block text-xs font-semibold text-foreground">
            {pt ? "Corpo da requisição (JSON)" : "Request Body (JSON)"}
          </label>
          <textarea
            value={data.body || ""}
            onChange={(e) => onChange({ ...data, body: e.target.value })}
            placeholder='{"key": "{{variable}}"}'
            rows={4}
            className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}

      {/* Response Variable */}
      <div>
        <label className="mb-2 block text-xs font-semibold text-foreground">
          {pt ? "Salvar resposta na variável" : "Save response to variable"}
        </label>
        <input
          type="text"
          value={data.responseVariable || ""}
          onChange={(e) => onChange({ ...data, responseVariable: e.target.value })}
          placeholder="e.g. api_response"
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          {pt ? "Opcional. Armazena o corpo da resposta em uma variável para uso posterior." : "Optional. Store the response body in a variable for later use."}
        </p>
      </div>
    </div>
  );
}

/* ───────── Go To Flow Config ───────── */
function GoToFlowConfig({ data, onChange }: ActionSubPanelProps) {
  const { locale } = useLocale();
  const pt = locale === "pt-BR";

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-xs font-semibold text-foreground">
          {pt ? "ID do fluxo de destino" : "Target Flow ID"}
        </label>
        <input
          type="text"
          value={data.flowId || ""}
          onChange={(e) => onChange({ ...data, flowId: e.target.value })}
          placeholder={pt ? "Digite o ID do fluxo..." : "Enter flow ID..."}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          {pt ? "O contato será redirecionado para este fluxo." : "The contact will be redirected to this flow."}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={data.returnAfter || false}
            onChange={(e) => onChange({ ...data, returnAfter: e.target.checked })}
            className="peer sr-only"
          />
          <div className="peer h-5 w-9 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-card after:transition-all peer-checked:bg-primary peer-checked:after:translate-x-full peer-focus:ring-2 peer-focus:ring-ring" />
        </label>
        <div>
          <p className="text-sm font-medium text-foreground">{pt ? "Retornar após a conclusão" : "Return after"}</p>
          <p className="text-xs text-muted-foreground">
            {pt ? "Voltar para este fluxo após o término do fluxo de destino" : "Come back to this flow after the target flow completes"}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ───────── Subscribe / Unsubscribe Config ───────── */
function SubscribeConfig({ data, onChange }: ActionSubPanelProps) {
  const { locale } = useLocale();
  const pt = locale === "pt-BR";
  const isSubscribe = data.actionType === "subscribe";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted p-4">
        <p className="text-sm font-medium text-foreground">
          {isSubscribe ? (pt ? "Inscrever contato" : "Subscribe Contact") : (pt ? "Cancelar inscrição do contato" : "Unsubscribe Contact")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {isSubscribe
            ? (pt ? "Isso marcará o contato como inscrito. Ele receberá transmissões e mensagens automatizadas." : "This will mark the contact as subscribed. They will receive broadcasts and automated messages.")
            : (pt ? "Isso marcará o contato como cancelado. Ele deixará de receber transmissões e a maioria das automações." : "This will mark the contact as unsubscribed. They will stop receiving broadcasts and most automated messages.")}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={data.confirmed || false}
            onChange={(e) => onChange({ ...data, confirmed: e.target.checked })}
            className="peer sr-only"
          />
          <div className="peer h-5 w-9 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-card after:transition-all peer-checked:bg-primary peer-checked:after:translate-x-full peer-focus:ring-2 peer-focus:ring-ring" />
        </label>
        <div>
          <p className="text-sm font-medium text-foreground">{pt ? "Confirmo esta ação" : "I confirm this action"}</p>
          <p className="text-xs text-muted-foreground">
            {pt ? "Esta ação afetará o status de inscrição do contato" : "This action will affect the contact's subscription status"}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ───────── Human Takeover Config ───────── */
function HumanTakeoverConfig({ data, onChange }: ActionSubPanelProps) {
  const { locale } = useLocale();
  const pt = locale === "pt-BR";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted p-4">
        <p className="text-sm font-medium text-foreground">{pt ? "Transferir para atendimento humano" : "Hand off to a human agent"}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {pt
            ? "O fluxo será pausado e a conversa será marcada para atendimento humano. As automações pararão até que um atendente as retome."
            : "The flow will pause and the conversation will be marked for human takeover. Automation will stop until an agent resumes it."}
        </p>
      </div>

      <div>
        <label className="mb-2 block text-xs font-semibold text-foreground">
          {pt ? "Nota interna (opcional)" : "Internal note (optional)"}
        </label>
        <textarea
          value={data.message || ""}
          onChange={(e) => onChange({ ...data, message: e.target.value })}
          placeholder={pt ? "Adicione contexto para o atendente..." : "Add context for the agent..."}
          rows={3}
          className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          {pt ? "Esta mensagem ficará visível aos atendentes como uma nota interna." : "This message will be visible to agents as an internal note."}
        </p>
      </div>
    </div>
  );
}

/* ───────── A/B Split Config ───────── */
function ABSplitConfig({ data, onChange }: ActionSubPanelProps) {
  const { locale } = useLocale();
  const pt = locale === "pt-BR";
  const paths = data.paths || [
    { name: "A", weight: 50 },
    { name: "B", weight: 50 },
  ];

  const totalWeight = paths.reduce((sum, p) => sum + p.weight, 0);

  const updatePath = useCallback(
    (index: number, updated: { name: string; weight: number }) => {
      const newPaths = [...paths];
      newPaths[index] = updated;
      onChange({ ...data, paths: newPaths });
    },
    [data, paths, onChange]
  );

  const addPath = useCallback(() => {
    onChange({ ...data, paths: [...paths, { name: String.fromCharCode(65 + paths.length), weight: 0 }] });
  }, [data, paths, onChange]);

  const removePath = useCallback(
    (index: number) => {
      if (paths.length <= 2) return;
      onChange({ ...data, paths: paths.filter((_, i) => i !== index) });
    },
    [data, paths, onChange]
  );

  const distributeEvenly = useCallback(() => {
    const evenWeight = Math.floor(100 / paths.length);
    const remainder = 100 - evenWeight * paths.length;
    const newPaths = paths.map((p, i) => ({
      ...p,
      weight: evenWeight + (i === 0 ? remainder : 0),
    }));
    onChange({ ...data, paths: newPaths });
  }, [data, paths, onChange]);

  return (
    <div className="space-y-4">
      {/* Distribution bar */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs font-semibold text-foreground">
            {pt ? "Distribuição de tráfego" : "Traffic Distribution"}
          </label>
          <button
            type="button"
            onClick={distributeEvenly}
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            {pt ? "Distribuir igualmente" : "Distribute evenly"}
          </button>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-muted">
          {paths.map((path, i) => {
            const colors = [
              "bg-blue-500",
              "bg-emerald-500",
              "bg-amber-500",
              "bg-purple-500",
              "bg-rose-500",
            ];
            return (
              <div
                key={i}
                className={cn("transition-all", colors[i % colors.length])}
                style={{ width: `${totalWeight > 0 ? (path.weight / totalWeight) * 100 : 0}%` }}
              />
            );
          })}
        </div>
        {totalWeight !== 100 && (
          <p className="mt-1 text-[11px] font-medium text-red-500">
            {pt ? `O total é ${totalWeight}% (deve somar 100%)` : `Total is ${totalWeight}% (should be 100%)`}
          </p>
        )}
      </div>

      {/* Paths */}
      <div className="space-y-2">
        {paths.map((path, index) => {
          const colors = [
            "border-l-blue-500",
            "border-l-emerald-500",
            "border-l-amber-500",
            "border-l-purple-500",
            "border-l-rose-500",
          ];
          return (
            <div
              key={index}
              className={cn(
                "flex items-center gap-2 rounded-lg border border-border border-l-4 bg-card p-3",
                colors[index % colors.length]
              )}
            >
              <input
                type="text"
                value={path.name}
                onChange={(e) => updatePath(index, { ...path, name: e.target.value })}
                className="w-16 rounded border border-border bg-muted px-2 py-1.5 text-xs font-medium text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <input
                type="range"
                min={0}
                max={100}
                value={path.weight}
                onChange={(e) =>
                  updatePath(index, { ...path, weight: parseInt(e.target.value) })
                }
                className="flex-1 accent-muted-foreground"
              />
              <span className="w-10 text-right text-xs font-semibold text-foreground">
                {path.weight}%
              </span>
              {paths.length > 2 && (
                <button
                  type="button"
                  onClick={() => removePath(index)}
                  className="rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {paths.length < 5 && (
        <button
          type="button"
          onClick={addPath}
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-muted-foreground hover:text-muted-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          {pt ? "Adicionar caminho" : "Add Path"}
        </button>
      )}
    </div>
  );
}

/* ───────── Smart Delay Config ───────── */
function SmartDelayConfig({ data, onChange }: ActionSubPanelProps) {
  const { locale } = useLocale();
  const pt = locale === "pt-BR";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted p-4">
        <p className="text-sm font-medium text-foreground">{pt ? "Atraso inteligente" : "Smart Delay"}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {pt
            ? "Pausa o fluxo e aguarda uma resposta do usuário. Se nenhuma resposta for recebida dentro do tempo limite, continua para a próxima etapa."
            : "Pause the flow and wait for a user response. If no response is received within the timeout, continue to the next step."}
        </p>
      </div>

      <div>
        <label className="mb-2 block text-xs font-semibold text-foreground">
          {pt ? "Tempo limite (Timeout)" : "Timeout"}
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            min={1}
            value={data.timeout || 30}
            onChange={(e) =>
              onChange({ ...data, timeout: Math.max(1, parseInt(e.target.value) || 1) })
            }
            className="w-24 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <select
            value={data.timeoutUnit || "minutes"}
            onChange={(e) => onChange({ ...data, timeoutUnit: e.target.value })}
            className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="minutes">{pt ? "Minutos" : "Minutes"}</option>
            <option value="hours">{pt ? "Horas" : "Hours"}</option>
            <option value="days">{pt ? "Dias" : "Days"}</option>
          </select>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {pt ? "Se o usuário não responder dentro deste período, o fluxo continuará." : "If the user does not respond within this time, the flow will continue."}
        </p>
      </div>
    </div>
  );
}
