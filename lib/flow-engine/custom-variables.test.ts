import { describe, expect, it, vi } from "vitest";
import { interpolateVariables, loadContactCustomVariables } from "./engine";
import { interpolateSimulationVariables } from "./simulator";
import type { FlowVariables } from "./types";

function createCustomFieldsSupabase(
  definitions: Array<{ id: string; slug: string }>,
  values: Array<{ field_id: string; value: string }>
) {
  return {
    from: vi.fn((table: string) => {
      const data = table === "custom_field_definitions" ? definitions : values;
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data, error: null }),
        }),
      };
    }),
  };
}

describe("custom message variables", () => {
  it("interpolates populated and empty custom fields", () => {
    const variables = { custom: { empresa: "Acme", email: "" } };

    expect(interpolateVariables("{{custom.empresa}} / {{custom.email}}", variables)).toBe("Acme / ");
    expect(interpolateSimulationVariables("{{custom.empresa}} / {{custom.email}}", variables)).toBe("Acme / ");
  });

  it("replaces unknown custom fields with empty text while preserving other unknown tokens", () => {
    expect(interpolateVariables("{{custom.removido}} {{unknown}}", { custom: {} })).toBe(" {{unknown}}");
    expect(interpolateSimulationVariables("{{custom.removido}} {{unknown}}", { custom: {} })).toBe(" {{unknown}}");
  });

  it("loads contact values and initializes known fields without values", async () => {
    const supabase = createCustomFieldsSupabase(
      [{ id: "field-1", slug: "empresa" }, { id: "field-2", slug: "email" }],
      [{ field_id: "field-1", value: "Acme" }]
    );
    const variables: FlowVariables = { message: "Olá" };

    await loadContactCustomVariables(supabase as never, "contact-1", "workspace-1", variables);

    expect(variables).toEqual({ message: "Olá", custom: { empresa: "Acme", email: "" } });
  });

  it("preserves stored session values when the contact has no current value row", async () => {
    const supabase = createCustomFieldsSupabase(
      [{ id: "field-1", slug: "empresa" }],
      []
    );
    const variables: FlowVariables = { custom: { empresa: "Valor preservado" }, ai_response: "Resposta" };

    await loadContactCustomVariables(supabase as never, "contact-1", "workspace-1", variables);

    expect(variables).toEqual({ custom: { empresa: "Valor preservado" }, ai_response: "Resposta" });
  });
});
