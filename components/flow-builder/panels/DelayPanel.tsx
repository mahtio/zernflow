"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/components/locale-provider";

type DelayUnit = "seconds" | "minutes" | "hours" | "days";
type DelayMode = "duration" | "until";

interface DelayPanelData {
  duration?: number;
  unit?: DelayUnit;
  waitUntil?: string;
  [key: string]: unknown;
}

interface DelayPanelProps {
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}

const unitOptions: Array<{ value: DelayUnit; label: string }> = [
  { value: "seconds", label: "Seconds" },
  { value: "minutes", label: "Minutes" },
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
];

const presets: Array<{ label: string; duration: number; unit: DelayUnit }> = [
  { label: "30 sec", duration: 30, unit: "seconds" },
  { label: "5 min", duration: 5, unit: "minutes" },
  { label: "1 hour", duration: 1, unit: "hours" },
  { label: "1 day", duration: 1, unit: "days" },
  { label: "3 days", duration: 3, unit: "days" },
  { label: "7 days", duration: 7, unit: "days" },
];

function toLocalDateTimeInput(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 16);
}

export function DelayPanel({ data: rawData, onChange }: DelayPanelProps) {
  const { locale } = useLocale();
  const pt = locale === "pt-BR";
  const unitLabels: Record<DelayUnit, string> = pt
    ? { seconds: "Segundos", minutes: "Minutos", hours: "Horas", days: "Dias" }
    : { seconds: "Seconds", minutes: "Minutes", hours: "Hours", days: "Days" };
  const data = rawData as DelayPanelData;
  const duration = data.duration || 0;
  const unit = data.unit || "minutes";
  const [mode, setMode] = useState<DelayMode>(data.waitUntil ? "until" : "duration");

  const handleModeChange = useCallback(
    (newMode: DelayMode) => {
      setMode(newMode);
      if (newMode === "duration") {
        onChange({ duration: data.duration || 5, unit: data.unit || "minutes", waitUntil: undefined });
      } else {
        onChange({ ...data, waitUntil: data.waitUntil || "" });
      }
    },
    [data, onChange]
  );

  const applyPreset = useCallback(
    (preset: { duration: number; unit: DelayUnit }) => {
      setMode("duration");
      onChange({ duration: preset.duration, unit: preset.unit, waitUntil: undefined });
    },
    [onChange]
  );

  return (
    <div className="space-y-5">
      {/* Mode Toggle */}
      <div>
        <label className="mb-2 block text-xs font-semibold text-foreground">
          {pt ? "Tipo de atraso" : "Delay Type"}
        </label>
        <div className="flex rounded-lg border border-border bg-muted p-1">
          <button
            type="button"
            onClick={() => handleModeChange("duration")}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              mode === "duration"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {pt ? "Aguardar por duração" : "Wait for duration"}
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("until")}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              mode === "until"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {pt ? "Aguardar até" : "Wait until"}
          </button>
        </div>
      </div>

      {mode === "duration" ? (
        <>
          {/* Duration Input */}
          <div>
            <label className="mb-2 block text-xs font-semibold text-foreground">
              {pt ? "Duração" : "Duration"}
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                value={duration}
                onChange={(e) =>
                  onChange({ ...data, duration: Math.max(0, parseInt(e.target.value) || 0), waitUntil: undefined })
                }
                className="w-24 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              <select
                value={unit}
                onChange={(e) =>
                  onChange({ ...data, unit: e.target.value as DelayUnit, waitUntil: undefined })
                }
                className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                {unitOptions.map((u) => (
                  <option key={u.value} value={u.value}>
                    {unitLabels[u.value]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Presets */}
          <div>
            <label className="mb-2 block text-xs font-semibold text-foreground">
              {pt ? "Atalhos rápidos" : "Quick presets"}
            </label>
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => {
                const isActive = duration === preset.duration && unit === preset.unit;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                      isActive
                        ? "bg-purple-500 text-white"
                        : "border border-border bg-card text-muted-foreground hover:border-purple-300 hover:text-purple-600"
                    )}
                  >
                    {pt ? `${preset.duration} ${unitLabels[preset.unit].toLowerCase()}` : preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        /* Wait Until */
        <div>
          <label className="mb-2 block text-xs font-semibold text-foreground">
            {pt ? "Aguardar até a data e hora" : "Wait until date/time"}
          </label>
          <input
            type="datetime-local"
            value={toLocalDateTimeInput(data.waitUntil)}
            onChange={(e) =>
              onChange({
                ...data,
                waitUntil: e.target.value
                  ? new Date(e.target.value).toISOString()
                  : "",
              })
            }
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            {pt ? "O fluxo ficará pausado até esta data e hora." : "The flow will pause until this specific date and time."}
          </p>
        </div>
      )}

      {/* Summary */}
      <div className="rounded-lg border border-border bg-muted p-3">
        <p className="text-xs font-medium text-muted-foreground">{pt ? "Prévia" : "Preview"}</p>
        <p className="mt-1 text-sm text-foreground">
          {mode === "duration"
            ? duration > 0
              ? (pt ? `Aguardar ${duration} ${unitLabels[unit].toLowerCase()} antes de continuar` : `Wait ${duration} ${unit} before continuing`)
              : (pt ? "Nenhum atraso configurado" : "No delay configured")
            : data.waitUntil
              ? (pt ? `Aguardar até ${new Date(data.waitUntil).toLocaleString(locale)}` : `Wait until ${new Date(data.waitUntil).toLocaleString()}`)
              : (pt ? "Nenhuma data selecionada" : "No date selected")}
        </p>
      </div>
    </div>
  );
}
