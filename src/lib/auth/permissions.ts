/**
 * Role-based access control for TaskFlow.
 *
 * Roles (workspace-scoped): OWNER, ADMIN, PROJECT_MANAGER, DEVELOPER, VIEWER.
 * Every server-side mutation MUST check permissions through this module —
 * never rely on UI state alone.
 */
export const ROLES = ["OWNER", "ADMIN", "PROJECT_MANAGER", "DEVELOPER", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "workspace:read",
  "workspace:manage",
  "workspace:transfer",
  "workspace:delete",
  "member:manage",
  "invitation:manage",
  "project:create",
  "project:manage",
  "project:delete",
  "issue:create",
  "issue:update",
  "issue:update:restricted", // changing assignee/status/priority (developers)
  "issue:delete",
  "comment:create",
  "comment:moderate",
  "sprint:manage",
  "sprint:content",
  "board:manage",
  "attachment:upload",
  "attachment:delete",
  "label:manage",
  "ai:use",
  "ai:apply",
  "integration:manage",
  "analytics:view",
  "activity:view",
  "notification:manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  OWNER: new Set(PERMISSIONS),
  ADMIN: new Set(PERMISSIONS.filter((p) => p !== "workspace:transfer" && p !== "workspace:delete")),
  PROJECT_MANAGER: new Set<Permission>([
    "workspace:read",
    "project:create",
    "project:manage",
    "issue:create",
    "issue:update",
    "issue:update:restricted",
    "issue:delete",
    "comment:create",
    "comment:moderate",
    "sprint:manage",
    "sprint:content",
    "board:manage",
    "attachment:upload",
    "attachment:delete",
    "label:manage",
    "ai:use",
    "ai:apply",
    "analytics:view",
    "activity:view",
    "notification:manage",
  ]),
  DEVELOPER: new Set<Permission>([
    "workspace:read",
    "issue:create",
    "issue:update:restricted",
    "comment:create",
    "sprint:content",
    "attachment:upload",
    "ai:use",
    "analytics:view",
    "activity:view",
    "notification:manage",
  ]),
  VIEWER: new Set<Permission>(["workspace:read", "analytics:view", "activity:view", "notification:manage"]),
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return MATRIX[role]?.has(permission) ?? false;
}

export function canAll(role: Role | null | undefined, permissions: Permission[]): boolean {
  return permissions.every((p) => can(role, p));
}

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  PROJECT_MANAGER: "Project Manager",
  DEVELOPER: "Developer",
  VIEWER: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  OWNER: "Full control, including ownership transfer and workspace deletion.",
  ADMIN: "Manages workspace settings, members, projects, and integrations.",
  PROJECT_MANAGER: "Manages projects, sprints, boards, and reports.",
  DEVELOPER: "Creates and updates issues, comments, and attachments.",
  VIEWER: "Read-only access to projects and reports.",
};

/** Roles that may be assigned via invitation (never OWNER — ownership is transferred explicitly). */
export const ASSIGNABLE_ROLES: Role[] = ["ADMIN", "PROJECT_MANAGER", "DEVELOPER", "VIEWER"];

const RANK: Record<Role, number> = { OWNER: 5, ADMIN: 4, PROJECT_MANAGER: 3, DEVELOPER: 2, VIEWER: 1 };

export function isAtLeast(role: Role, minimum: Role): boolean {
  return RANK[role] >= RANK[minimum];
}

export function isProjectFieldEditable(role: Role): boolean {
  return can(role, "issue:update") || can(role, "issue:update:restricted");
}
