"use client";

import {
  Zap,
  MessageSquare,
  GitBranch,
  Clock,
  Tag,
  FileText,
  Globe,
  ArrowRightLeft,
  UserCheck,
  Bell,
  Shuffle,
  Hourglass,
  Sparkles,
  ListOrdered,
} from "lucide-react";
import type { DragEvent } from "react";
import { useLocale } from "@/components/locale-provider";

interface PaletteItem {
  type: string;
  nodeType: string;
  label: string;
  icon: typeof Zap;
  actionType?: string;
}

interface PaletteCategory {
  name: string;
  items: PaletteItem[];
}

const categories: PaletteCategory[] = [
  {
    name: "Triggers",
    items: [
      { type: "trigger", nodeType: "trigger", label: "Keyword Trigger", icon: Zap },
    ],
  },
  {
    name: "Messages",
    items: [
      {
        type: "sendMessage",
        nodeType: "sendMessage",
        label: "Send Message",
        icon: MessageSquare,
      },
      {
        type: "aiResponse",
        nodeType: "aiResponse",
        label: "AI Response",
        icon: Sparkles,
      },
    ],
  },
  {
    name: "Logic",
    items: [
      { type: "condition", nodeType: "condition", label: "Condition", icon: GitBranch },
      { type: "delay", nodeType: "delay", label: "Delay", icon: Clock },
      {
        type: "action",
        nodeType: "abSplit",
        label: "A/B Split",
        icon: Shuffle,
        actionType: "abSplit",
      },
      {
        type: "action",
        nodeType: "smartDelay",
        label: "Smart Delay",
        icon: Hourglass,
        actionType: "smartDelay",
      },
    ],
  },
  {
    name: "Actions",
    items: [
      {
        type: "action",
        nodeType: "addTag",
        label: "Add Tag",
        icon: Tag,
        actionType: "addTag",
      },
      {
        type: "action",
        nodeType: "removeTag",
        label: "Remove Tag",
        icon: Tag,
        actionType: "removeTag",
      },
      {
        type: "action",
        nodeType: "setCustomField",
        label: "Set Field",
        icon: FileText,
        actionType: "setCustomField",
      },
      {
        type: "action",
        nodeType: "httpRequest",
        label: "HTTP Request",
        icon: Globe,
        actionType: "httpRequest",
      },
      {
        type: "action",
        nodeType: "goToFlow",
        label: "Go To Flow",
        icon: ArrowRightLeft,
        actionType: "goToFlow",
      },
      {
        type: "action",
        nodeType: "humanTakeover",
        label: "Human Takeover",
        icon: UserCheck,
        actionType: "humanTakeover",
      },
      {
        type: "action",
        nodeType: "subscribe",
        label: "Subscribe",
        icon: Bell,
        actionType: "subscribe",
      },
      {
        type: "action",
        nodeType: "unsubscribe",
        label: "Unsubscribe",
        icon: Bell,
        actionType: "unsubscribe",
      },
      {
        type: "action",
        nodeType: "enrollSequence",
        label: "Enroll in Sequence",
        icon: ListOrdered,
        actionType: "enrollSequence",
      },
    ],
  },
];

function onDragStart(event: DragEvent, item: PaletteItem) {
  const data = JSON.stringify({
    type: item.type,
    nodeType: item.nodeType,
    actionType: item.actionType,
  });
  event.dataTransfer.setData("application/reactflow", data);
  event.dataTransfer.effectAllowed = "move";
}

export function NodePalette() {
  const { locale } = useLocale();
  const translations: Record<string, string> = {
    Triggers: "Gatilhos", "Keyword Trigger": "Gatilho de palavra-chave",
    Messages: "Mensagens", "Send Message": "Enviar mensagem", "AI Response": "Resposta com IA",
    Logic: "Lógica", Condition: "Condição", Delay: "Atraso", "A/B Split": "Divisão A/B", "Smart Delay": "Atraso inteligente",
    Actions: "Ações", "Add Tag": "Adicionar etiqueta", "Remove Tag": "Remover etiqueta", "Set Field": "Definir campo", "HTTP Request": "Requisição HTTP", "Go To Flow": "Ir para fluxo", "Human Takeover": "Atendimento humano", Subscribe: "Inscrever", Unsubscribe: "Cancelar inscrição", "Enroll in Sequence": "Inscrever em sequência",
  };
  const translate = (value: string) => locale === "pt-BR" ? translations[value] ?? value : value;

  return (
    <div className="flex w-56 flex-col border-r border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{locale === "pt-BR" ? "Nós" : "Nodes"}</h2>
        <p className="text-xs text-muted-foreground">{locale === "pt-BR" ? "Arraste para o canvas" : "Drag to canvas"}</p>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {categories.map((category) => (
          <div key={category.name} className="mb-4">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {translate(category.name)}
            </h3>
            <div className="space-y-1">
              {category.items.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.nodeType}
                    draggable
                    onDragStart={(e) => onDragStart(e, item)}
                    className="flex cursor-grab items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground active:cursor-grabbing"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-xs font-medium">{translate(item.label)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
