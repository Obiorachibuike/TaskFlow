import { describe, it, expect } from "vitest";
import {
  can,
  canAll,
  isAtLeast,
  ROLES,
  ASSIGNABLE_ROLES,
  type Role,
  type Permission,
} from "@/lib/auth/permissions";

describe("RBAC permission matrix", () => {
  it("owner can do everything, including ownership transfer", () => {
    for (const p of [
      "workspace:manage",
      "workspace:transfer",
      "workspace:delete",
      "member:manage",
      "issue:delete",
      "integration:manage",
    ] as Permission[]) {
      expect(can("OWNER", p)).toBe(true);
    }
  });

  it("admin cannot transfer or delete the workspace", () => {
    expect(can("ADMIN", "workspace:manage")).toBe(true);
    expect(can("ADMIN", "member:manage")).toBe(true);
    expect(can("ADMIN", "workspace:transfer")).toBe(false);
    expect(can("ADMIN", "workspace:delete")).toBe(false);
  });

  it("project manager can manage sprints/boards but not workspace settings", () => {
    expect(can("PROJECT_MANAGER", "sprint:manage")).toBe(true);
    expect(can("PROJECT_MANAGER", "board:manage")).toBe(true);
    expect(can("PROJECT_MANAGER", "issue:delete")).toBe(true);
    expect(can("PROJECT_MANAGER", "workspace:manage")).toBe(false);
    expect(can("PROJECT_MANAGER", "member:manage")).toBe(false);
    expect(can("PROJECT_MANAGER", "integration:manage")).toBe(false);
  });

  it("developer can create issues and comment but not delete issues or manage sprints", () => {
    expect(can("DEVELOPER", "issue:create")).toBe(true);
    expect(can("DEVELOPER", "comment:create")).toBe(true);
    expect(can("DEVELOPER", "issue:update:restricted")).toBe(true);
    expect(can("DEVELOPER", "issue:update")).toBe(false);
    expect(can("DEVELOPER", "issue:delete")).toBe(false);
    expect(can("DEVELOPER", "sprint:manage")).toBe(false);
    expect(can("DEVELOPER", "ai:use")).toBe(true);
  });

  it("viewer is read-only", () => {
    const writePerms: Permission[] = [
      "issue:create",
      "issue:update",
      "issue:update:restricted",
      "issue:delete",
      "comment:create",
      "attachment:upload",
      "sprint:manage",
      "ai:apply",
    ];
    for (const p of writePerms) {
      expect(can("VIEWER", p)).toBe(false);
    }
    expect(can("VIEWER", "workspace:read")).toBe(true);
    expect(can("VIEWER", "analytics:view")).toBe(true);
  });

  it("null/unknown roles have no permissions", () => {
    expect(can(null, "workspace:read")).toBe(false);
    expect(can(undefined, "workspace:read")).toBe(false);
    expect(can("SUPERUSER" as Role, "workspace:read")).toBe(false);
  });

  it("ownership is never an assignable invitation role", () => {
    expect(ASSIGNABLE_ROLES).not.toContain("OWNER");
    expect(new Set(ROLES).has("OWNER")).toBe(true);
  });

  it("role ranking orders owner > admin > pm > developer > viewer", () => {
    expect(isAtLeast("OWNER", "ADMIN")).toBe(true);
    expect(isAtLeast("ADMIN", "PROJECT_MANAGER")).toBe(true);
    expect(isAtLeast("DEVELOPER", "VIEWER")).toBe(true);
    expect(isAtLeast("VIEWER", "DEVELOPER")).toBe(false);
  });

  it("canAll requires every permission", () => {
    expect(canAll("OWNER", ["issue:create", "workspace:manage"])).toBe(true);
    expect(canAll("DEVELOPER", ["issue:create", "workspace:manage"])).toBe(false);
  });
});
