"use client";

import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  type NodeTypes,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useCallback, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Save, Rocket, Loader2, History, Play, Download, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useLocale } from "@/components/locale-provider";
import { createClient } from "@/lib/supabase/client";
import type { Database, FlowStatus, Json } from "@/lib/types/database";
import type { FlowEdge, FlowNode } from "@/lib/flow-engine/types";
import { normalizeCommentPrivateReplies } from "@/lib/flow-engine/comment-private-reply";

import { NodePalette } from "./node-palette";
import { TriggerNode } from "./nodes/trigger-node";
import { SendMessageNode } from "./nodes/send-message-node";
import { ConditionNode } from "./nodes/condition-node";
import { DelayNode } from "./nodes/delay-node";
import { ActionNode } from "./nodes/action-node";
import { AiResponseNode } from "./nodes/AiResponseNode";
import { NodeConfigSidebar } from "./panels/NodeConfigSidebar";
import { VersionHistoryPanel } from "./panels/VersionHistoryPanel";
import { TestPanel } from "./panels/TestPanel";

type Flow = Database["public"]["Tables"]["flows"]["Row"];
type CustomFieldDefinition = Pick<
  Database["public"]["Tables"]["custom_field_definitions"]["Row"],
  "id" | "name" | "slug"
>;

const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  sendMessage: SendMessageNode,
  condition: ConditionNode,
  delay: DelayNode,
  action: ActionNode,
  aiResponse: AiResponseNode,
};

interface FlowCanvasProps {
  flow: Flow;
  customFields: CustomFieldDefinition[];
}

let nodeId = 0;
function getNodeId() {
  return `node_${Date.now()}_${nodeId++}`;
}

function getDefaultData(type: string, actionType?: string): Record<string, unknown> {
  switch (type) {
    case "trigger":
      return { triggerType: "keyword", keywords: [] };
    case "sendMessage":
      return { messages: [] };
    case "condition":
      return { conditions: [], logic: "and" };
    case "delay":
      return { duration: 5, unit: "minutes" };
    case "aiResponse":
      return { systemPrompt: "", model: "openai/gpt-4o-mini", temperature: 0.7, maxTokens: 500, contextMessages: 10 };
    case "action":
      return actionType === "smartDelay"
        ? { actionType, timeout: 30, timeoutUnit: "minutes" }
        : { actionType: actionType || "addTag" };
    default:
      return {};
  }
}

function FlowCanvasInner({ flow, customFields }: FlowCanvasProps) {
  const router = useRouter();
  const { locale } = useLocale();
  const pt = locale === "pt-BR";
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const supabase = createClient();

  const rawInitialNodes: Node[] = Array.isArray(flow.nodes)
    ? (flow.nodes as unknown as Node[])
    : [];
  const initialEdges: Edge[] = Array.isArray(flow.edges)
    ? (flow.edges as unknown as Edge[])
    : [];
  const initialNormalization = normalizeCommentPrivateReplies(
    rawInitialNodes as unknown as FlowNode[],
    initialEdges as unknown as FlowEdge[],
    flow.id
  );
  const initialNodes = initialNormalization.nodes as unknown as Node[];

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [flowName, setFlowName] = useState(flow.name);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [versionPanelOpen, setVersionPanelOpen] = useState(false);
  const [testPanelOpen, setTestPanelOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [migrationNotice, setMigrationNotice] = useState(initialNormalization.changed);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [availableCustomFields, setAvailableCustomFields] = useState(customFields);

  const selectedNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId) || null
    : null;

  const handleCustomFieldCreated = useCallback(
    (field: CustomFieldDefinition) => {
      setAvailableCustomFields((fields) =>
        [...fields.filter((item) => item.id !== field.id), field].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );
    },
    []
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const source = nodes.find((node) => node.id === connection.source);
      const target = nodes.find((node) => node.id === connection.target);
      const sourceIsCommentTrigger = source?.type === "trigger" && source.data.triggerType === "comment_keyword";
      if (sourceIsCommentTrigger && target?.type !== "sendMessage") {
        setSaveError(pt
          ? "A primeira saída de um gatilho de comentário deve ser Enviar mensagem."
          : "A comment trigger must connect first to a Send Message node.");
        setTimeout(() => setSaveError(null), 4000);
        return;
      }
      if (sourceIsCommentTrigger && edges.some((edge) => edge.source === source.id)) {
        setSaveError(pt
          ? "O gatilho de comentário aceita somente uma saída."
          : "A comment trigger accepts only one output.");
        setTimeout(() => setSaveError(null), 4000);
        return;
      }
      if (sourceIsCommentTrigger && target) {
        const normalized = normalizeCommentPrivateReplies(
          nodes as unknown as FlowNode[],
          [...edges, { id: "pending", source: source.id, target: target.id }] as unknown as FlowEdge[],
          flow.id
        );
        setNodes(normalized.nodes as unknown as Node[]);
      }
      setEdges((current) =>
        addEdge(
          {
            ...connection,
            animated: true,
            style: { stroke: "var(--border)", strokeWidth: 2 },
          },
          current
        )
      );
    },
    [edges, flow.id, nodes, pt, setEdges, setNodes]
  );

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();

      const raw = event.dataTransfer.getData("application/reactflow");
      if (!raw) return;

      const { type, nodeType, actionType } = JSON.parse(raw) as {
        type: string;
        nodeType: string;
        actionType?: string;
      };

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: getNodeId(),
        type,
        position,
        data: getDefaultData(type, actionType || nodeType),
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [screenToFlowPosition, setNodes]
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
    },
    []
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const onNodeDataChange = useCallback(
    (nodeId: string, newData: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: newData } : n
        )
      );
    },
    [setNodes]
  );

  const closeSidebar = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelectedNodeId(null);
    },
    [setNodes, setEdges]
  );

  const saveFlow = useCallback(
    async (status?: FlowStatus) => {
      if (status === "published") {
        setPublishing(true);
      } else {
        setSaving(true);
      }

      try {
        const update: Database["public"]["Tables"]["flows"]["Update"] = {
          name: flowName,
          nodes: nodes as unknown as Json,
          edges: edges as unknown as Json,
          updated_at: new Date().toISOString(),
        };

        if (status) {
          update.status = status;
          if (status === "published") {
            update.published_at = new Date().toISOString();
          }
        }

        const { error } = await supabase
          .from("flows")
          .update(update)
          .eq("id", flow.id);

        if (error) {
          console.error("Failed to save flow:", error);
          setSaveError("Failed to save");
          setTimeout(() => setSaveError(null), 3000);
          return;
        }

        setSaveError(null);
        setLastSaved(new Date());
      } finally {
        setSaving(false);
        setPublishing(false);
      }
    },
    [flowName, nodes, edges, flow.id, supabase]
  );

  const handleSave = useCallback(() => saveFlow(), [saveFlow]);
  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/v1/flows/${flow.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        console.error("Failed to delete flow");
        setSaveError("Failed to delete");
        setTimeout(() => setSaveError(null), 3000);
        setDeleting(false);
        return;
      }
      router.push("/dashboard/flows");
    } catch (err) {
      console.error("Failed to delete flow:", err);
      setSaveError("Failed to delete");
      setTimeout(() => setSaveError(null), 3000);
      setDeleting(false);
    }
  }, [flow.id, router]);
  const handlePublish = useCallback(async () => {
    setPublishing(true);
    try {
      // First save the current state
      await saveFlow();
      // Then call the publish API which increments version and saves snapshot
      const res = await fetch(`/api/v1/flows/${flow.id}/publish`, {
        method: "POST",
      });
      const result = await res.json().catch(() => null) as { error?: string; nodes?: Node[] } | null;
      if (!res.ok) {
        const message = result?.error || (pt ? "Falha ao publicar" : "Failed to publish");
        console.error("Failed to publish flow:", message);
        setSaveError(message);
        setTimeout(() => setSaveError(null), 7000);
        return;
      }
      if (Array.isArray(result?.nodes)) setNodes(result.nodes);
      setSaveError(null);
      setLastSaved(new Date());
      router.refresh();
    } finally {
      setPublishing(false);
    }
  }, [saveFlow, flow.id, pt, router, setNodes]);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard/flows")}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {pt ? "Voltar" : "Back"}
          </button>
          <div className="h-5 w-px bg-border" />
          <input
            type="text"
            value={flowName}
            onChange={(e) => setFlowName(e.target.value)}
            className="w-auto max-w-[200px] border-none bg-transparent text-sm font-semibold outline-none focus:ring-0"
            style={{ width: `${Math.max(flowName.length, 8)}ch` }}
            placeholder={pt ? "Nome do fluxo" : "Flow name"}
          />
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
              flow.status === "published"
                ? "bg-emerald-100 text-emerald-800"
                : flow.status === "archived"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-muted text-muted-foreground"
            )}
          >
            {pt ? ({ draft: "rascunho", published: "publicado", archived: "arquivado" }[flow.status as FlowStatus] ?? flow.status) : flow.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {saveError && (
            <span className="text-xs font-medium text-destructive">
              {saveError}
            </span>
          )}
          {!saveError && lastSaved && (
            <span className="text-xs text-muted-foreground">
              {pt ? "Salvo" : "Saved"} {lastSaved.toLocaleTimeString(locale)}
            </span>
          )}
          <button
            onClick={() => {
              setTestPanelOpen(!testPanelOpen);
              if (!testPanelOpen) {
                setVersionPanelOpen(false);
                setSelectedNodeId(null);
              }
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              testPanelOpen
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background hover:bg-accent"
            )}
          >
            <Play className="h-3.5 w-3.5" />
            {pt ? "Testar" : "Test"}
          </button>
          <button
            onClick={() => {
              setVersionPanelOpen(!versionPanelOpen);
              if (!versionPanelOpen) {
                setTestPanelOpen(false);
                setSelectedNodeId(null);
              }
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              versionPanelOpen
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background hover:bg-accent"
            )}
          >
            <History className="h-3.5 w-3.5" />
            {pt ? "Histórico" : "History"}
          </button>
          <button
            onClick={() => {
              const exportData = {
                name: flowName,
                description: flow.description || null,
                nodes,
                edges,
                version: flow.version || 1,
                exportedAt: new Date().toISOString(),
                source: "zernflow",
              };
              const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${flowName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.flow.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            {pt ? "Exportar" : "Export"}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {pt ? "Salvar" : "Save"}
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {publishing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Rocket className="h-3.5 w-3.5" />
            )}
            {pt ? "Publicar" : "Publish"}
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={deleting}
            className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            title={pt ? "Excluir fluxo" : "Delete flow"}
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
          <ConfirmDialog
            open={confirmDelete}
            title={pt ? "Excluir fluxo" : "Delete flow"}
            message={pt ? `"${flowName}" e seus gatilhos, versões e histórico de execuções serão excluídos permanentemente. Esta ação não pode ser desfeita.` : `"${flowName}" and its triggers, versions, and run history will be permanently deleted. This cannot be undone.`}
            confirmLabel={pt ? "Excluir" : "Delete"}
            cancelLabel={pt ? "Cancelar" : "Cancel"}
            destructive
            onConfirm={() => {
              setConfirmDelete(false);
              handleDelete();
            }}
            onCancel={() => setConfirmDelete(false)}
          />
        </div>
      </div>

      {migrationNotice && (
        <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {pt
              ? "Este fluxo foi ajustado às regras do Instagram: a primeira mensagem após o comentário agora é uma resposta privada com um único botão."
              : "This flow was adjusted to Instagram rules: the first comment message is now a private reply with one button."}
          </span>
          <button type="button" onClick={() => setMigrationNotice(false)} className="font-medium underline">
            {pt ? "Entendi" : "Dismiss"}
          </button>
        </div>
      )}

      {/* Canvas area */}
      <div className="flex flex-1 overflow-hidden">
        <NodePalette />
        <div ref={reactFlowWrapper} className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            deleteKeyCode={["Backspace", "Delete"]}
            proOptions={{ hideAttribution: true }}
            className="bg-background"
          >
            <Background gap={16} size={1} className="!bg-background" />
            <Controls
              className="!border-border !bg-card !shadow-sm [&>button]:!border-border [&>button]:!bg-card [&>button]:!text-foreground [&>button:hover]:!bg-accent"
            />
            <MiniMap
              className="!border-border !bg-card"
              nodeColor={() => "var(--primary)"}
              maskColor="rgba(0, 0, 0, 0.1)"
            />
          </ReactFlow>
        </div>
        {selectedNode && !versionPanelOpen && !testPanelOpen && (
          <NodeConfigSidebar
            node={selectedNode}
            nodes={nodes}
            edges={edges}
            workspaceId={flow.workspace_id}
            customFields={availableCustomFields}
            onCustomFieldCreated={handleCustomFieldCreated}
            onChange={onNodeDataChange}
            onClose={closeSidebar}
            onDelete={deleteNode}
          />
        )}
        {versionPanelOpen && (
          <VersionHistoryPanel
            flowId={flow.id}
            currentVersion={flow.version}
            onClose={() => setVersionPanelOpen(false)}
            onRestore={() => router.refresh()}
          />
        )}
        {testPanelOpen && (
          <TestPanel
            nodes={nodes}
            edges={edges}
            onClose={() => setTestPanelOpen(false)}
            onHighlightNode={(nodeId) => {
              // Scroll to and highlight the node
              const node = nodes.find((n) => n.id === nodeId);
              if (node) setSelectedNodeId(nodeId);
            }}
          />
        )}
      </div>
    </div>
  );
}

export function FlowCanvas({ flow, customFields }: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner flow={flow} customFields={customFields} />
    </ReactFlowProvider>
  );
}
