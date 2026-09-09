"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/components/locale-provider";

export interface DelayNodeProps {
  label?: string;
  duration?: number;
  unit?: "seconds" | "minutes" | "hours" | "days";
}

export function DelayNode({ data, selected }: NodeProps) {
  const { locale } = useLocale();
  const pt = locale === "pt-BR";
  const nodeData = data as DelayNodeProps;
  const label = nodeData.label || (pt ? "Atraso" : "Delay");
  const duration = nodeData.duration || 0;
  const unit = nodeData.unit || "minutes";
  const unitLabels = pt
    ? { seconds: "segundos", minutes: "minutos", hours: "horas", days: "dias" }
    : { seconds: "seconds", minutes: "minutes", hours: "hours", days: "days" };

  const displayDuration =
    duration > 0 ? `${duration} ${unitLabels[unit]}` : (pt ? "Não configurado" : "Not configured");

  return (
    <div
      className={cn(
        "w-56 rounded-lg border bg-card shadow-sm transition-shadow",
        selected ? "border-purple-500 shadow-md" : "border-border"
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-purple-500 !bg-white"
      />
      <div className="flex items-center gap-2 rounded-t-lg bg-purple-500 px-3 py-2 text-white">
        <Clock className="h-3.5 w-3.5" />
        <span className="text-xs font-semibold">{pt ? "Atraso" : "Delay"}</span>
      </div>
      <div className="p-3">
        <p className="text-sm font-medium">{label}</p>
        <p
          className={cn(
            "mt-1 text-xs",
            duration > 0 ? "text-muted-foreground" : "text-muted-foreground italic"
          )}
        >
          {displayDuration}
        </p>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-purple-500 !bg-white"
      />
    </div>
  );
}
