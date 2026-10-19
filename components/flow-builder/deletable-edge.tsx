"use client";

import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow, type EdgeProps } from "@xyflow/react";
import { Trash2 } from "lucide-react";
import { useLocale } from "@/components/locale-provider";

export function DeletableEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerStart, markerEnd, interactionWidth } = props;
  const { setEdges } = useReactFlow();
  const { locale } = useLocale();
  const label = locale === "pt-BR" ? "Excluir conexão" : "Delete connection";
  const [path, labelX, labelY] = getBezierPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerStart={markerStart} markerEnd={markerEnd} interactionWidth={interactionWidth} />
      <EdgeLabelRenderer>
        <button
          type="button"
          aria-label={label}
          title={label}
          className="nodrag nopan absolute flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:border-red-500 hover:bg-red-500/10 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          style={{ pointerEvents: "all", transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          onClick={(event) => {
            event.stopPropagation();
            setEdges((edges) => edges.filter((edge) => edge.id !== id));
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
