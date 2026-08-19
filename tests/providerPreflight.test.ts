import { describe, expect, it } from "vitest";
import { interpretModelAvailability, interpretPlan, modelPassesPreflight, planPassesPreflight } from "../scripts/providerPreflight";

describe("interpretModelAvailability", () => {
  it("passes when the model is present and available_on_current_plan is true", () => {
    const models = { data: [{ id: "Qwen/Qwen3-VL-30B-A3B-Instruct", available_on_current_plan: true }] };
    const result = interpretModelAvailability(models, "Qwen/Qwen3-VL-30B-A3B-Instruct");

    expect(result).toEqual({ found: true, available: true, status: undefined });
    expect(modelPassesPreflight(result)).toBe(true);
  });

  it("passes when the model is present with no availability field at all", () => {
    const models = { data: [{ id: "Qwen/Qwen3-VL-30B-A3B-Instruct" }] };
    const result = interpretModelAvailability(models, "Qwen/Qwen3-VL-30B-A3B-Instruct");

    expect(modelPassesPreflight(result)).toBe(true);
  });

  it("fails when the model is missing from /models", () => {
    const models = { data: [{ id: "some-other-model" }] };
    const result = interpretModelAvailability(models, "Qwen/Qwen3-VL-30B-A3B-Instruct");

    expect(result.found).toBe(false);
    expect(modelPassesPreflight(result)).toBe(false);
  });

  it("fails when the model is explicitly reported unavailable on the current plan", () => {
    const models = { data: [{ id: "Qwen/Qwen3-VL-30B-A3B-Instruct", available_on_current_plan: false }] };
    const result = interpretModelAvailability(models, "Qwen/Qwen3-VL-30B-A3B-Instruct");

    expect(result).toEqual({ found: true, available: false, status: undefined });
    expect(modelPassesPreflight(result)).toBe(false);
  });

  it("reads a textual status field when present", () => {
    const models = { data: [{ id: "Qwen/Qwen3-VL-30B-A3B-Instruct", status: "warm" }] };
    const result = interpretModelAvailability(models, "Qwen/Qwen3-VL-30B-A3B-Instruct");

    expect(result.status).toBe("warm");
  });

  it("accepts a models list under either data or models", () => {
    const models = { models: [{ id: "Qwen/Qwen3-VL-30B-A3B-Instruct" }] };
    expect(interpretModelAvailability(models, "Qwen/Qwen3-VL-30B-A3B-Instruct").found).toBe(true);
  });

  it("treats a missing/malformed list as no models found rather than throwing", () => {
    expect(() => interpretModelAvailability({}, "x")).not.toThrow();
    expect(interpretModelAvailability({}, "x").found).toBe(false);
  });
});

describe("interpretPlan", () => {
  it("recognises max_context_length in addition to max_context/limits.max_context", () => {
    expect(interpretPlan({ max_context_length: 32000 }).contextCeiling).toBe(32000);
    expect(interpretPlan({ max_context: 16000 }).contextCeiling).toBe(16000);
    expect(interpretPlan({ limits: { max_context: 8000 } }).contextCeiling).toBe(8000);
  });

  it("prefers max_context_length when multiple fields are present", () => {
    expect(interpretPlan({ max_context_length: 32000, max_context: 16000 }).contextCeiling).toBe(32000);
  });

  it("reports undefined fields as undefined rather than throwing on a bare response", () => {
    const summary = interpretPlan({});
    expect(summary).toEqual({ name: undefined, contextCeiling: undefined, concurrency: undefined });
  });
});

describe("planPassesPreflight", () => {
  it("fails on an empty/malformed plan response with no name or id", () => {
    expect(planPassesPreflight(interpretPlan({}))).toBe(false);
  });

  it("passes when the plan reports a name", () => {
    expect(planPassesPreflight(interpretPlan({ name: "pro" }))).toBe(true);
  });

  it("passes when the plan reports only an id", () => {
    expect(planPassesPreflight(interpretPlan({ id: "plan_123" }))).toBe(true);
  });
});
