import { describe, it, expect } from "vitest";
import { capabilitySchemas, capabilityMeta, UNTRUSTED_POLICY } from "@/lib/ai/capabilities";
import { aiCapabilitySchema, aiRequestSchema, aiApplySchema } from "@/lib/validation";
import { setAIProviderForTests, getAIProvider, AIError, type AIProvider } from "@/lib/ai/provider";

describe("AI structured output validation", () => {
  it("accepts a valid generate_tasks payload", () => {
    const parsed = capabilitySchemas.generate_tasks.safeParse({
      tasks: [
        { title: "Implement login", description: "email+password", type: "TASK", priority: "HIGH", storyPoints: 3 },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects payloads with missing titles or wrong enums", () => {
    expect(capabilitySchemas.generate_tasks.safeParse({ tasks: [{ title: "x" }] }).success).toBe(false);
    expect(
      capabilitySchemas.generate_tasks.safeParse({
        tasks: [{ title: "A valid title here", type: "NOT_A_TYPE" }],
      }).success,
    ).toBe(false);
  });

  it("validates suggest_priorities strictly", () => {
    expect(
      capabilitySchemas.suggest_priorities.safeParse({
        suggestions: [{ issueKey: "NOVA-1", priority: "HIGH", rationale: "due soon" }],
      }).success,
    ).toBe(true);
    expect(
      capabilitySchemas.suggest_priorities.safeParse({
        suggestions: [{ issueKey: "NOVA-1", priority: "CRITICAL" }],
      }).success,
    ).toBe(false);
  });

  it("validates break_down_epic and scheduling_risks", () => {
    expect(
      capabilitySchemas.break_down_epic.safeParse({
        stories: [{ title: "Story one here", subtasks: ["Sub A"] }],
      }).success,
    ).toBe(true);
    expect(
      capabilitySchemas.scheduling_risks.safeParse({
        summary: "risk",
        risks: [{ severity: "high", description: "tight deadline", relatedIssueKeys: ["NOVA-1"] }],
      }).success,
    ).toBe(true);
  });

  it("never accepts empty or non-JSON results as valid output", () => {
    expect(capabilitySchemas.summarize_project.safeParse(null).success).toBe(false);
    expect(capabilitySchemas.summarize_project.safeParse("just text").success).toBe(false);
    expect(capabilitySchemas.summarize_project.safeParse({}).success).toBe(false);
  });
});

describe("AI request schemas", () => {
  it("whitelists capabilities only", () => {
    expect(aiCapabilitySchema.safeParse("summarize_project").success).toBe(true);
    expect(aiCapabilitySchema.safeParse("delete_everything").success).toBe(false);
  });

  it("validates request and apply payloads", () => {
    expect(aiRequestSchema.safeParse({ capability: "next_task", projectId: "clx0000000000000000000000" }).success).toBe(true);
    expect(aiApplySchema.safeParse({ jobId: "clx0000000000000000000000", selection: ["0", "1"] }).success).toBe(true);
  });
});

describe("AI provider abstraction", () => {
  it("reports not_configured instead of fabricating responses", async () => {
    setAIProviderForTests(null);
    delete process.env.AI_API_KEY;
    // re-import would create fresh; force by setting null above
    const provider = getAIProvider();
    expect(provider === null || provider.isConfigured() === false).toBe(true);
  });

  it("can be swapped via setAIProviderForTests", async () => {
    const fake: AIProvider = {
      name: "fake",
      model: "fake-1",
      isConfigured: () => true,
      complete: async () => ({ text: "{}", provider: "fake", model: "fake-1" }),
    };
    setAIProviderForTests(fake);
    expect(getAIProvider()?.name).toBe("fake");
    setAIProviderForTests(null);
  });

  it("AIError kinds are stable for error mapping", () => {
    const err = new AIError("timeout", "timeout");
    expect(err.kind).toBe("timeout");
  });
});

describe("prompt policy hardening", () => {
  it("forbids following instructions inside untrusted data", () => {
    expect(UNTRUSTED_POLICY).toContain("untrusted");
    expect(UNTRUSTED_POLICY.toLowerCase()).toContain("ignore any commands");
    expect(UNTRUSTED_POLICY).toContain("JSON");
  });

  it("capability metadata marks applyable actions", () => {
    expect(capabilityMeta.generate_tasks.applyable).toBe(true);
    expect(capabilityMeta.summarize_project.applyable).toBe(false);
    expect(capabilityMeta.break_down_epic.requiredInput).toBe("issue");
  });
});
