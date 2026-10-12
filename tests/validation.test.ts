import { describe, it, expect } from "vitest";
import {
  registerSchema,
  createProjectSchema,
  createIssueSchema,
  updateIssueSchema,
  createSprintSchema,
  issueFilterSchema,
  inviteMemberSchema,
  passwordSchema,
} from "@/lib/validation";

describe("auth validation", () => {
  it("requires strong-enough passwords", () => {
    expect(passwordSchema.safeParse("short1").success).toBe(false);
    expect(passwordSchema.safeParse("alllettersonly").success).toBe(false);
    expect(passwordSchema.safeParse("123456789").success).toBe(false);
    expect(passwordSchema.safeParse("goodpass1").success).toBe(true);
  });

  it("normalizes emails and validates registration", () => {
    const r = registerSchema.safeParse({
      name: "Ada",
      email: "  ADA@Example.COM ",
      password: "goodpass1",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("ada@example.com");
    expect(registerSchema.safeParse({ name: "", email: "x", password: "goodpass1" }).success).toBe(false);
  });

  it("invitation roles exclude OWNER", () => {
    expect(inviteMemberSchema.safeParse({ email: "a@b.com", role: "DEVELOPER" }).success).toBe(true);
    expect(inviteMemberSchema.safeParse({ email: "a@b.com", role: "OWNER" }).success).toBe(false);
  });
});

describe("project validation", () => {
  it("enforces project key format", () => {
    expect(createProjectSchema.safeParse({ name: "Nova", key: "NOVA" }).success).toBe(true);
    expect(createProjectSchema.safeParse({ name: "Nova", key: "1BAD" }).success).toBe(false);
    expect(createProjectSchema.safeParse({ name: "Nova", key: "has space" }).success).toBe(false);
    expect(createProjectSchema.safeParse({ name: "Nova", key: "TOOLONGKEY" }).success).toBe(false);
  });

  it("converts date-only strings to Date objects", () => {
    const r = createProjectSchema.safeParse({
      name: "Nova",
      startDate: "2026-01-01",
      targetDate: "2026-06-01",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.startDate).toBeInstanceOf(Date);
    }
  });
});

describe("issue validation", () => {
  it("rejects start date after due date", () => {
    const r = createIssueSchema.safeParse({
      projectId: "clx0000000000000000000000",
      title: "Something",
      startDate: "2026-06-01",
      dueDate: "2026-01-01",
    });
    expect(r.success).toBe(false);
  });

  it("accepts a minimal issue and a full issue", () => {
    expect(
      createIssueSchema.safeParse({ projectId: "clx0000000000000000000000", title: "Minimal" }).success,
    ).toBe(true);
    expect(
      createIssueSchema.safeParse({
        projectId: "clx0000000000000000000000",
        title: "Full issue title",
        type: "BUG",
        priority: "URGENT",
        storyPoints: 3,
        startDate: "2026-01-01",
        dueDate: "2026-02-01",
      }).success,
    ).toBe(true);
  });

  it("rejects invalid enums and oversized story points", () => {
    expect(
      createIssueSchema.safeParse({
        projectId: "clx0000000000000000000000",
        title: "Bad enum",
        type: "MEGATASK",
      }).success,
    ).toBe(false);
    expect(
      createIssueSchema.safeParse({
        projectId: "clx0000000000000000000000",
        title: "Bad points",
        storyPoints: 10000,
      }).success,
    ).toBe(false);
  });

  it("update schema allows partials", () => {
    expect(updateIssueSchema.safeParse({ title: "New title" }).success).toBe(true);
    expect(updateIssueSchema.safeParse({ priority: "LOW" }).success).toBe(true);
    expect(updateIssueSchema.safeParse({}).success).toBe(true);
  });
});

describe("sprint validation", () => {
  it("rejects inverted date ranges", () => {
    expect(
      createSprintSchema.safeParse({
        projectId: "clx0000000000000000000000",
        name: "S1",
        startDate: "2026-02-01",
        endDate: "2026-01-01",
      }).success,
    ).toBe(false);
    expect(
      createSprintSchema.safeParse({
        projectId: "clx0000000000000000000000",
        name: "S1",
        startDate: "2026-01-01",
        endDate: "2026-02-01",
      }).success,
    ).toBe(true);
  });
});

describe("issue filter validation", () => {
  it("coerces pagination and booleans from query strings", () => {
    const r = issueFilterSchema.safeParse({ page: "2", pageSize: "25", includeDone: "true", overdue: "1" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.page).toBe(2);
      expect(r.data.pageSize).toBe(25);
      expect(r.data.includeDone).toBe(true);
    }
  });

  it("rejects out-of-range page sizes", () => {
    expect(issueFilterSchema.safeParse({ pageSize: 5000 }).success).toBe(false);
    expect(issueFilterSchema.safeParse({ page: 0 }).success).toBe(false);
  });
});
