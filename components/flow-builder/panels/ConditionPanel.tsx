"use client";

import { useCallback } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/components/locale-provider";
import { DEFAULT_CONDITION_TIMEZONE } from "@/lib/flow-engine/date-condition";

interface Condition {
  field: string;
  operator: string;
  value: string;
  timezone?: string;
}

interface ConditionPanelData {
  conditions?: Condition[];
  logic?: "and" | "or";
  [key: string]: unknown;
}

interface ConditionPanelProps {
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}

const fieldOptions = [
  { value: "tag", label: "Tag" },
  { value: "custom_field", label: "Custom Field" },
  { value: "platform", label: "Platform" },
  { value: "variable", label: "Variable" },
  { value: "is_subscribed", label: "Is Subscribed" },
  { value: "last_interaction", label: "Last Interaction" },
  { value: "current_datetime", label: "Current date and time" },
];

const dateOperatorOptions = [
  { value: "after", label: "after" },
  { value: "before", label: "before" },
];

const operatorOptions = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "exists", label: "exists" },
  { value: "gt", label: "greater than" },
  { value: "lt", label: "less than" },
];

export function ConditionPanel({ data: rawData, onChange }: ConditionPanelProps) {
  const { locale } = useLocale();
  const pt = locale === "pt-BR";
  const fieldLabels: Record<string, string> = { tag: "Etiqueta", custom_field: "Campo personalizado", platform: "Plataforma", variable: "Variável", is_subscribed: "Está inscrito", last_interaction: "Última interação", current_datetime: "Data e hora atual" };
  const operatorLabels: Record<string, string> = { equals: "é igual a", not_equals: "não é igual a", contains: "contém", exists: "existe", gt: "maior que", lt: "menor que", after: "após", before: "antes de" };
  const data = rawData as ConditionPanelData;
  const conditions = data.conditions || [];
  const logic = data.logic || "and";

  const addCondition = useCallback(() => {
    onChange({
      ...data,
      conditions: [...conditions, { field: "tag", operator: "equals", value: "" }],
    });
  }, [data, conditions, onChange]);

  const updateCondition = useCallback(
    (index: number, updated: Condition) => {
      const updated_conditions = [...conditions];
      updated_conditions[index] = updated;
      onChange({ ...data, conditions: updated_conditions });
    },
    [data, conditions, onChange]
  );

  const removeCondition = useCallback(
    (index: number) => {
      onChange({ ...data, conditions: conditions.filter((_, i) => i !== index) });
    },
    [data, conditions, onChange]
  );

  const toggleLogic = useCallback(() => {
    onChange({ ...data, logic: logic === "and" ? "or" : "and" });
  }, [data, logic, onChange]);

  return (
    <div className="space-y-4">
      {/* Logic Toggle */}
      {conditions.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{pt ? "Corresponder a" : "Match"}</span>
          <button
            type="button"
            onClick={toggleLogic}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
              logic === "and"
                ? "bg-amber-100 text-amber-700"
                : "bg-blue-100 text-blue-700"
            )}
          >
            {logic === "and" ? (pt ? "TODAS" : "ALL") : (pt ? "QUALQUER" : "ANY")}
          </button>
          <span className="text-xs text-muted-foreground">{pt ? "condições" : "conditions"}</span>
        </div>
      )}

      {/* Conditions List */}
      <div className="space-y-3">
        {conditions.map((condition, index) => (
          <div key={index}>
            {index > 0 && (
              <div className="my-2 flex items-center justify-center">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                    logic === "and"
                      ? "bg-amber-100 text-amber-600"
                      : "bg-blue-100 text-blue-600"
                  )}
                >
                  {logic}
                </span>
              </div>
            )}
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {pt ? "Condição" : "Condition"} {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeCondition(index)}
                  className="rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>

              {/* Field */}
              <div className="space-y-2">
                <select
                  value={condition.field}
                  onChange={(e) => {
                    const field = e.target.value;
                    const dateChanged = field === "current_datetime" || condition.field === "current_datetime";
                    updateCondition(index, {
                      ...condition, field,
                      ...(dateChanged ? {
                        operator: field === "current_datetime" ? "after" : "equals",
                        value: "",
                        timezone: field === "current_datetime" ? DEFAULT_CONDITION_TIMEZONE : undefined,
                      } : {}),
                    });
                  }}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  {fieldOptions.map((f) => (
                    <option key={f.value} value={f.value}>
                      {pt ? fieldLabels[f.value] : f.label}
                    </option>
                  ))}
                </select>

                {/* Operator */}
                <select
                  value={condition.operator}
                  onChange={(e) =>
                    updateCondition(index, { ...condition, operator: e.target.value })
                  }
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  {(condition.field === "current_datetime" ? dateOperatorOptions : operatorOptions).map((o) => (
                    <option key={o.value} value={o.value}>
                      {pt ? operatorLabels[o.value] : o.label}
                    </option>
                  ))}
                </select>

                {/* Value (hidden for "exists" operator) */}
                {condition.operator !== "exists" && (
                  <input
                    type={condition.field === "current_datetime" ? "datetime-local" : "text"}
                    aria-label={pt ? "Valor da condição" : "Condition value"}
                    value={condition.value}
                    onChange={(e) =>
                      updateCondition(index, { ...condition, value: e.target.value })
                    }
                    placeholder={pt ? "Valor..." : "Value..."}
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                )}
                {condition.field === "current_datetime" && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {pt ? "Fuso horário fixo: São Paulo (America/Sao_Paulo)." : "Fixed time zone: São Paulo (America/Sao_Paulo)."}
                    </p>
                    {!condition.value && (
                      <p className="text-xs text-amber-600">{pt ? "Selecione a data e o horário para completar a condição." : "Select a date and time to complete this condition."}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {pt ? "Compara o momento em que o contato chega a este bloco com a data e hora de São Paulo. Não agenda um disparo automático." : "Compares when the contact reaches this block with the date and time in São Paulo. Does not schedule an automatic trigger."}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Condition */}
      <button
        type="button"
        onClick={addCondition}
        className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-amber-400 hover:text-amber-500"
      >
        <Plus className="h-4 w-4" />
        {pt ? "Adicionar condição" : "Add Condition"}
      </button>

      {conditions.length === 0 && (
        <p className="text-center text-xs text-muted-foreground">
          {pt ? "Adicione condições para criar ramificações. Contatos que correspondem seguem pelo caminho “Sim”; os demais, pelo caminho “Não”." : "Add conditions to create branching logic. Contacts matching the conditions go to the “Yes” path, others go to “No”."}
        </p>
      )}
    </div>
  );
}
