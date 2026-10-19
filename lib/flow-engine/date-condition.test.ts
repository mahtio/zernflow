import { describe, expect, it } from "vitest";
import { evaluateDateCondition } from "./date-condition";

describe("date conditions", () => {
  const now = new Date("2026-12-25T21:00:00Z");
  it("compares the current time in São Paulo instead of the server zone", () => {
    expect(evaluateDateCondition({ operator: "after", value: "2026-12-25T17:59" }, now)).toBe(true);
    expect(evaluateDateCondition({ operator: "before", value: "2026-12-25T18:01" }, now)).toBe(true);
    expect(evaluateDateCondition({ operator: "after", value: "2026-12-25T19:00" }, now)).toBe(false);
  });
  it("uses strict before/after boundaries", () => {
    for (const operator of ["before", "after"]) {
      expect(evaluateDateCondition({ operator, value: "2026-12-25T18:00" }, now)).toBe(false);
    }
  });
  it("always uses São Paulo even when another zone was previously saved", () => {
    for (const timezone of ["UTC", "Europe/Lisbon", "invalid"]) {
      expect(evaluateDateCondition({ operator: "after", value: "2026-12-25T20:00", timezone }, now)).toBe(false);
    }
  });
  it("handles date rollover in São Paulo", () => {
    expect(evaluateDateCondition({ operator: "before", value: "2026-12-25T23:00" }, new Date("2026-12-26T01:00:00Z"))).toBe(true);
  });
  it("rejects incomplete, invalid or unsupported configurations", () => {
    for (const value of ["", "2026-12-25", "2026-02-30T18:00", "2026-12-25T25:00"]) {
      expect(evaluateDateCondition({ operator: "after", value }, now)).toBe(false);
    }
    expect(evaluateDateCondition({ operator: "equals", value: "2026-12-25T18:00" }, now)).toBe(false);
  });
});
