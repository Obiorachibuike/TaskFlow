import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestUser, cleanupTestDb, testPrisma } from "./helpers";
import {
  createWorkspace,
  inviteMember,
  listWorkspacesForUser,
  updateWorkspace,
  removeMember,
  transferOwnership,
  listMembers,
} from "@/lib/services/workspace";
import { createProject, listProjects, deleteProject } from "@/lib/services/project";
import { createIssue, listIssuesInWorkspace, getIssueByKey, updateIssue } from "@/lib/services/issue";
import { requireWorkspaceMembership } from "@/lib/auth/guards";
import { ServiceError } from "@/lib/errors";
import type { Actor } from "@/lib/auth/session";

let owner: Actor & { id: string };
let outsider: Actor & { id: string };
let wsSlug: string;
let wsId: string;

beforeAll(async () => {
  await cleanupTestDb();
  owner = await createTestUser("Owner");
  outsider = await createTestUser("Outsider");
  const ws = await createWorkspace(owner, { name: "Private Workspace" });
  wsSlug = ws.slug;
  wsId = ws.id;
});

afterAll(async () => {
  await cleanupTestDb();
  await testPrisma().$disconnect();
});

describe("workspace isolation", () => {
  it("outsiders cannot see or resolve private workspaces", async () => {
    const list = await listWorkspacesForUser(outsider.userId);
    expect(list.find((w) => w.id === wsId)).toBeUndefined();

    await expect(requireWorkspaceMembership(outsider, wsSlug)).rejects.toThrow(ServiceError);
    await expect(requireWorkspaceMembership(outsider, wsSlug)).rejects.toThrow(/not found/i);
  });

  it("outsiders cannot list projects or issues in the workspace", async () => {
    await expect(listProjects(outsider, wsSlug)).rejects.toThrow(/not found/i);
    await expect(listIssuesInWorkspace(outsider, wsSlug, {})).rejects.toThrow(/not found/i);
  });

  it("outsiders cannot mutate workspace settings", async () => {
    await expect(updateWorkspace(outsider, wsSlug, { name: "Hacked" })).rejects.toThrow(/not found/i);
    const ws = await testPrisma().workspace.findUnique({ where: { id: wsId } });
    expect(ws?.name).toBe("Private Workspace");
  });

  it("issues from one workspace are invisible to members of another", async () => {
    const project = await createProject(owner, wsSlug, { name: "Secret Project", key: "SEC" });
    const issue = await createIssue(owner, {
      projectId: project.id,
      title: "Confidential roadmap item",
    });

    // outsider in a different workspace
    const otherWs = await createWorkspace(outsider, { name: "Other Workspace" });
    await expect(getIssueByKey(outsider, otherWs.slug, issue.key)).rejects.toThrow(/not found/i);
    await expect(updateIssue(outsider, issue.id, { title: "Stolen" })).rejects.toThrow(/not found/i);

    // owner can see it
    const found = await getIssueByKey(owner, wsSlug, issue.key);
    expect(found.issue.title).toBe("Confidential roadmap item");
  });

  it("cross-workspace project ids cannot be used to create issues elsewhere", async () => {
    const otherWs = await createWorkspace(outsider, { name: "Sandbox" });
    const project = await createProject(owner, wsSlug, { name: "Target", key: "TGT" });
    await expect(
      createIssue(outsider, { projectId: project.id, title: "Injected issue" }),
    ).rejects.toThrow(/not found|forbidden/i);
    void otherWs;
  });
});

describe("roles and membership", () => {
  it("owner can invite members and assign roles", async () => {
    const inv = await inviteMember(owner, wsId, { email: outsider.email, role: "DEVELOPER" });
    expect(inv.status).toBe("PENDING");
    const hash = inv.tokenHash;
    expect(hash).not.toBeNull();
    // token hash is stored, never the raw token
    expect(String(hash)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("developer role cannot manage workspace settings", async () => {
    // accept manually for the test (simulate acceptance)
    await testPrisma().workspaceMember.create({
      data: { workspaceId: wsId, userId: outsider.userId, role: "DEVELOPER" },
    });
    await expect(updateWorkspace(outsider, wsId, { name: "Nope" })).rejects.toThrow(/cannot perform/i);
  });

  it("developer role cannot delete projects", async () => {
    const project = await createProject(owner, wsSlug, { name: "Guarded", key: "GRD" });
    await expect(deleteProject(outsider, wsSlug, project.key)).rejects.toThrow(/cannot perform/i);
  });

  it("ownership transfer enforces owner role and confirmation text", async () => {
    const members = await listMembers(wsId);
    const ownerMember = members.find((m) => m.userId === owner.userId)!;
    const otherMember = members.find((m) => m.userId === outsider.userId)!;

    await expect(
      transferOwnership(outsider, wsId, { memberId: ownerMember.id, confirmText: "TRANSFER" }),
    ).rejects.toThrow(/owner/i);

    await expect(
      transferOwnership(owner, wsId, { memberId: otherMember.id, confirmText: "yes" }),
    ).rejects.toThrow(/TRANSFER/);

    await transferOwnership(owner, wsId, { memberId: otherMember.id, confirmText: "TRANSFER" });
    const updated = await listMembers(wsId);
    expect(updated.find((m) => m.userId === outsider.userId)?.role).toBe("OWNER");
    expect(updated.find((m) => m.userId === owner.userId)?.role).toBe("ADMIN");
  });

  it("the owner role cannot be removed through member removal", async () => {
    const members = await listMembers(wsId);
    const newOwner = members.find((m) => m.role === "OWNER")!;
    // current actor (outsider) is now OWNER and tries to remove themselves — forbidden via role checks
    await expect(removeMember(outsider, wsId, newOwner.id)).rejects.toThrow(/owner cannot be removed/i);
  });
});
