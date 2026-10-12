import { z } from "zod";

// ── Primitives ──────────────────────────────────────────────────────────────
export const idSchema = z.string().cuid();
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .refine((p) => /[A-Za-z]/.test(p) && /[0-9]/.test(p), {
    message: "Password must include a letter and a number",
  });
export const nameSchema = z.string().trim().min(1, "Required").max(120);
export const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a hex color like #6366F1");

export const roleSchema = z.enum(["OWNER", "ADMIN", "PROJECT_MANAGER", "DEVELOPER", "VIEWER"]);
export const assignableRoleSchema = z.enum(["ADMIN", "PROJECT_MANAGER", "DEVELOPER", "VIEWER"]);
export const issueTypeSchema = z.enum(["EPIC", "STORY", "TASK", "BUG", "SUBTASK"]);
export const issuePrioritySchema = z.enum(["URGENT", "HIGH", "MEDIUM", "LOW"]);
export const projectStatusSchema = z.enum(["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]);
export const boardCategorySchema = z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"]);

const dateValue = z.union([z.string(), z.date(), z.null()]).transform((v) => {
  if (v === null || v === undefined || v === "") return null;
  const d =
    v instanceof Date
      ? v
      : /^\d{4}-\d{2}-\d{2}$/.test(v)
        ? new Date(`${v}T00:00:00.000Z`)
        : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
});
const optionalDate = dateValue.optional();

// ── Auth ────────────────────────────────────────────────────────────────────
export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: passwordSchema,
});

export const updateProfileSchema = z.object({
  name: nameSchema.optional(),
  image: z.string().url().max(500).nullable().optional(),
  timeZone: z.string().max(64).optional(),
  avatarColor: hexColorSchema.optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const notificationPrefsSchema = z.object({
  emailInvites: z.boolean(),
  emailAssignments: z.boolean(),
  emailMentions: z.boolean(),
  emailDueDate: z.boolean(),
  emailStatusChange: z.boolean(),
  inAppMentions: z.boolean(),
  inAppAssignments: z.boolean(),
  inAppStatusChange: z.boolean(),
});

// ── Workspace ───────────────────────────────────────────────────────────────
export const createWorkspaceSchema = z.object({
  name: nameSchema,
  description: z.string().trim().max(500).optional(),
  icon: z.string().trim().max(8).optional(),
  color: hexColorSchema.optional(),
});

export const updateWorkspaceSchema = createWorkspaceSchema.partial();

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: assignableRoleSchema,
});

export const updateMemberRoleSchema = z.object({
  memberId: idSchema,
  role: assignableRoleSchema,
});

export const transferOwnershipSchema = z.object({
  memberId: idSchema,
  confirmText: z.string().refine((v) => v.trim().toUpperCase() === "TRANSFER", {
    message: 'Type "TRANSFER" to confirm',
  }),
});

// ── Project ─────────────────────────────────────────────────────────────────
export const createProjectSchema = z.object({
  name: nameSchema,
  key: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, "Key must be at least 2 characters")
    .max(8, "Key must be at most 8 characters")
    .regex(/^[A-Z][A-Z0-9]*$/, "Key must start with a letter and contain only letters/numbers")
    .optional(),
  description: z.string().trim().max(5000).optional(),
  icon: z.string().trim().max(8).optional(),
  color: hexColorSchema.optional(),
  status: projectStatusSchema.optional(),
  startDate: optionalDate,
  targetDate: optionalDate,
  leadId: idSchema.nullable().optional(),
});

export const updateProjectSchema = createProjectSchema.partial();

// ── Board ───────────────────────────────────────────────────────────────────
export const createBoardColumnSchema = z.object({
  name: nameSchema,
  key: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(32)
    .regex(/^[a-z0-9_-]+$/, "Use lowercase letters, numbers, - and _"),
  category: boardCategorySchema,
  color: hexColorSchema.optional(),
});

export const updateBoardColumnSchema = z.object({
  columnId: idSchema,
  name: nameSchema.optional(),
  color: hexColorSchema.nullable().optional(),
  category: boardCategorySchema.optional(),
});

export const moveIssueSchema = z.object({
  issueId: idSchema,
  status: z.string().min(1).max(32),
  beforeId: idSchema.nullable().optional(), // issue to place before (null = top)
  afterId: idSchema.nullable().optional(), // issue to place after (null = bottom)
});

export const reorderColumnsSchema = z.object({
  orderedIds: z.array(idSchema).min(1),
});

// ── Issue ───────────────────────────────────────────────────────────────────
export const createIssueSchema = z
  .object({
    projectId: idSchema,
    title: nameSchema,
    description: z.string().max(50000).optional(),
    type: issueTypeSchema.optional(),
    status: z.string().min(1).max(32).optional(),
    priority: issuePrioritySchema.optional(),
    storyPoints: z.number().min(0).max(999).nullable().optional(),
    startDate: optionalDate,
    dueDate: optionalDate,
    parentIssueId: idSchema.nullable().optional(),
    sprintId: idSchema.nullable().optional(),
    assigneeIds: z.array(idSchema).max(10).optional(),
    labelIds: z.array(idSchema).max(20).optional(),
  })
  .refine(
    (v) => !v.startDate || !v.dueDate || (v.startDate && v.dueDate && v.startDate <= v.dueDate),
    { message: "Start date must be before due date", path: ["startDate"] },
  );

export const updateIssueSchema = z
  .object({
    title: nameSchema.optional(),
    description: z.string().max(50000).optional(),
    type: issueTypeSchema.optional(),
    status: z.string().min(1).max(32).optional(),
    priority: issuePrioritySchema.optional(),
    storyPoints: z.number().min(0).max(999).nullable().optional(),
    startDate: optionalDate,
    dueDate: optionalDate,
    parentIssueId: idSchema.nullable().optional(),
    sprintId: idSchema.nullable().optional(),
    assigneeIds: z.array(idSchema).max(10).optional(),
    labelIds: z.array(idSchema).max(20).optional(),
  })
  .refine(
    (v) => !v.startDate || !v.dueDate || (v.startDate && v.dueDate && v.startDate <= v.dueDate),
    { message: "Start date must be before due date", path: ["startDate"] },
  );

export const duplicateIssueSchema = z.object({
  issueId: idSchema,
  title: nameSchema.optional(),
});

export const bulkIssueSchema = z.object({
  issueIds: z.array(idSchema).min(1).max(100),
  action: z.enum(["assign", "unassign", "setPriority", "setStatus", "setType", "addLabel", "removeLabel", "delete", "addToSprint", "removeFromSprint"]),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export const issueFilterSchema = z.object({
  q: z.string().trim().max(200).optional(),
  projectId: idSchema.optional(),
  status: z.union([z.string(), z.array(z.string())]).optional(),
  priority: z.union([issuePrioritySchema, z.array(issuePrioritySchema)]).optional(),
  type: z.union([issueTypeSchema, z.array(issueTypeSchema)]).optional(),
  assigneeId: z.union([z.string(), z.literal("me"), z.literal("unassigned"), z.array(z.string())]).optional(),
  labelId: z.union([z.string(), z.array(z.string())]).optional(),
  sprintId: z.union([z.string(), z.literal("none"), z.array(z.string())]).optional(),
  parentId: z.union([z.string(), z.literal("none")]).optional(),
  overdue: z.coerce.boolean().optional(),
  dueBefore: optionalDate,
  dueAfter: optionalDate,
  includeDone: z.coerce.boolean().optional(),
  sort: z.enum(["updatedAt", "createdAt", "priority", "dueDate", "rank", "key"]).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

// ── Comments ────────────────────────────────────────────────────────────────
export const createCommentSchema = z.object({
  issueId: idSchema,
  body: z.string().trim().min(1, "Comment cannot be empty").max(20000),
  parentId: idSchema.nullable().optional(),
});

export const updateCommentSchema = z.object({
  commentId: idSchema,
  body: z.string().trim().min(1).max(20000),
});

// ── Labels ──────────────────────────────────────────────────────────────────
export const createLabelSchema = z.object({
  projectId: idSchema.nullable().optional(),
  name: nameSchema.max(40),
  color: hexColorSchema.optional(),
});

// ── Sprints ─────────────────────────────────────────────────────────────────
export const createSprintSchema = z
  .object({
    projectId: idSchema,
    name: nameSchema,
    goal: z.string().trim().max(500).optional(),
    startDate: z.union([z.string(), z.date()]).transform((v) => new Date(v)),
    endDate: z.union([z.string(), z.date()]).transform((v) => new Date(v)),
  })
  .refine((v) => v.startDate < v.endDate, {
    message: "Sprint start must be before end",
    path: ["endDate"],
  });

export const updateSprintSchema = z.object({
  name: nameSchema.optional(),
  goal: z.string().trim().max(500).nullable().optional(),
  startDate: z.union([z.string(), z.date()]).transform((v) => new Date(v)).optional(),
  endDate: z.union([z.string(), z.date()]).transform((v) => new Date(v)).optional(),
});

export const sprintIssuesSchema = z.object({
  sprintId: idSchema,
  issueIds: z.array(idSchema).min(1).max(200),
  action: z.enum(["add", "remove"]),
});

export const completeSprintSchema = z.object({
  sprintId: idSchema,
  moveUnfinishedTo: z.enum(["backlog", "next-sprint", "none"]).default("backlog"),
  nextSprintId: idSchema.nullable().optional(),
});

// ── Milestones ──────────────────────────────────────────────────────────────
export const createMilestoneSchema = z.object({
  projectId: idSchema,
  name: nameSchema,
  description: z.string().max(1000).optional(),
  date: z.union([z.string(), z.date()]).transform((v) => new Date(v)),
});

// ── AI ──────────────────────────────────────────────────────────────────────
export const aiCapabilitySchema = z.enum([
  "summarize_project",
  "summarize_discussion",
  "generate_tasks",
  "break_down_epic",
  "suggest_priorities",
  "recommend_sprint",
  "explain_overdue",
  "scheduling_risks",
  "next_task",
]);

export const aiRequestSchema = z.object({
  capability: aiCapabilitySchema,
  projectId: idSchema.optional(),
  issueId: idSchema.optional(),
  sprintId: idSchema.optional(),
  criteria: z.string().max(500).optional(),
  description: z.string().max(8000).optional(),
});

export const aiApplySchema = z.object({
  jobId: idSchema,
  selection: z.array(z.string()).optional(), // ids of proposed items to apply
});

// ── Integrations ────────────────────────────────────────────────────────────
export const connectGithubSchema = z.object({
  installationType: z.enum(["oauth", "pat"]),
  token: z.string().min(20).max(512).optional(),
  repos: z.array(z.string().regex(/^[^/\s]+\/[^/\s]+$/)).max(20).optional(),
});

// ── Notifications ───────────────────────────────────────────────────────────
export const listNotificationsSchema = z.object({
  unreadOnly: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type CreateWorkspaceInput = z.input<typeof createWorkspaceSchema>;
export type CreateProjectInput = z.input<typeof createProjectSchema>;
export type CreateIssueInput = z.input<typeof createIssueSchema>;
export type UpdateIssueInput = z.input<typeof updateIssueSchema>;
export type IssueFilterInput = z.infer<typeof issueFilterSchema>;
export type AiCapability = z.infer<typeof aiCapabilitySchema>;
