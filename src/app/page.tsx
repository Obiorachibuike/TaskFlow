import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  GitBranch,
  KanbanSquare,
  Layers,
  LineChart,
  Lock,
  Search,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const features = [
  {
    icon: KanbanSquare,
    title: "Boards that match your workflow",
    description:
      "Configurable columns, keyboard-accessible drag-and-drop, inline creation, and optimistic UI with honest error handling.",
  },
  {
    icon: Layers,
    title: "Sprints & backlog",
    description:
      "Plan sprints, estimate in story points, carry unfinished work forward, and track burndown and velocity from real activity data.",
  },
  {
    icon: Bot,
    title: "AI project assistant",
    description:
      "Summarize projects, break epics into stories, suggest priorities and sprint scope — every change is confirmed by you before it happens.",
  },
  {
    icon: Users,
    title: "Real-time collaboration",
    description:
      "Comments, @mentions, notifications, and live board updates with workspace-scoped, authenticated connections.",
  },
  {
    icon: LineChart,
    title: "Reports grounded in data",
    description:
      "Dashboard metrics, workload, deadlines, and sprint reports computed from your database — never hardcoded.",
  },
  {
    icon: GitBranch,
    title: "GitHub integration",
    description:
      "Link branches, commits, and pull requests to issue keys with signature-verified webhooks — work is never auto-completed.",
  },
];

const stats = [
  { value: "5 roles", label: "Granular RBAC" },
  { value: "20+", label: "Normalized models" },
  { value: "9", label: "AI capabilities" },
  { value: "2", label: "Themes" },
];

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* subtle ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[-20%] h-[600px]"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, rgba(99,102,241,0.18), transparent 70%), radial-gradient(40% 40% at 80% 10%, rgba(139,92,246,0.12), transparent 70%)",
        }}
      />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
            <Zap className="h-4 w-4" />
          </div>
          <span className="text-lg font-semibold tracking-tight">TaskFlow</span>
        </div>
        <nav className="hidden items-center gap-6 text-sm text-muted md:flex">
          <a href="#features" className="transition-colors hover:text-foreground">
            Features
          </a>
          <a href="#security" className="transition-colors hover:text-foreground">
            Security
          </a>
          <a href="#ai" className="transition-colors hover:text-foreground">
            AI
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/register">
              Get started
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-6">
        <section className="pt-16 pb-14 text-center md:pt-24">
          <Badge variant="default" className="mb-5">
            <Sparkles className="h-3 w-3" />
            AI-powered project management
          </Badge>
          <h1 className="mx-auto max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
            Plan smarter. Build faster.{" "}
            <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Ship together.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted md:text-lg">
            TaskFlow brings projects, issues, sprints, boards, reporting, and an AI assistant into
            one focused workspace — with real-time collaboration and role-based security your team
            can trust.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/register">
                Create your workspace
                <ArrowRight />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/login">Sign in to TaskFlow</Link>
            </Button>
          </div>

          <div className="mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-4 md:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-lg border border-border-subtle bg-surface/60 px-4 py-4">
                <div className="text-2xl font-semibold text-foreground">{s.value}</div>
                <div className="mt-1 text-xs text-muted">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Product preview strip */}
        <section className="rounded-xl border border-border-subtle bg-surface/70 p-2 shadow-[var(--shadow-md)]">
          <div className="rounded-lg border border-border-subtle bg-surface-2/60 p-6">
            <div className="flex items-center gap-2 pb-4">
              <div className="h-2.5 w-2.5 rounded-full bg-danger/70" />
              <div className="h-2.5 w-2.5 rounded-full bg-warning/70" />
              <div className="h-2.5 w-2.5 rounded-full bg-success/70" />
              <div className="ml-3 flex items-center gap-2 rounded-md border border-border-subtle bg-surface px-3 py-1 text-xs text-muted">
                <Search className="h-3 w-3" />
                Search issues, projects, comments…
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { name: "To Do", count: 8, color: "#94A3B8" },
                { name: "In Progress", count: 5, color: "#6366F1" },
                { name: "In Review", count: 3, color: "#8B5CF6" },
                { name: "Done", count: 12, color: "#22C55E" },
              ].map((col) => (
                <div key={col.name} className="rounded-lg border border-border-subtle bg-surface p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted">
                      <span className="h-2 w-2 rounded-full" style={{ background: col.color }} />
                      {col.name}
                    </div>
                    <span className="text-xs text-faint">{col.count}</span>
                  </div>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="mb-2 rounded-md border border-border-subtle bg-surface-2 p-2.5">
                      <div className="h-2 w-3/4 rounded bg-surface-3" />
                      <div className="mt-2 flex items-center gap-1.5">
                        <div className="h-2 w-10 rounded bg-primary/30" />
                        <div className="h-2 w-2 rounded-full bg-surface-3" />
                        <div className="h-2 w-2 rounded-full bg-surface-3" />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="py-20">
          <h2 className="text-center text-3xl font-semibold tracking-tight">
            Everything a team needs to ship
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted">
            Purpose-built workflows for software teams — from the first idea to the final release.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-lg border border-border-subtle bg-surface/60 p-5 transition-colors hover:border-primary/40"
              >
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <f.icon className="h-4.5 w-4.5" />
                </div>
                <h3 className="font-medium text-foreground">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="security" className="pb-20">
          <div className="grid items-center gap-8 rounded-xl border border-border-subtle bg-surface/60 p-8 md:grid-cols-2">
            <div>
              <Badge variant="secondary">
                <Lock className="h-3 w-3" />
                Security first
              </Badge>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight">
                Permissions enforced on every request
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Workspace-scoped data access, role-based permissions (Owner, Admin, Project Manager,
                Developer, Viewer), hashed single-use tokens for email verification and password
                recovery, encrypted integration secrets, and webhook signature verification. The UI
                never decides what you can do — the server does.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted">
                {[
                  "Protected routes & API handlers",
                  "Cross-workspace isolation on every query",
                  "Mass-assignment safe validated inputs (Zod)",
                  "CSRF-safe cookie sessions via Auth.js",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-border-subtle bg-surface-2/60 p-6">
              <div className="space-y-3">
                {[
                  { role: "Owner", desc: "Full control + ownership transfer", w: "w-full" },
                  { role: "Admin", desc: "Workspace, members, integrations", w: "w-5/6" },
                  { role: "Project Manager", desc: "Projects, sprints, boards", w: "w-2/3" },
                  { role: "Developer", desc: "Issues, comments, attachments", w: "w-1/2" },
                  { role: "Viewer", desc: "Read-only access", w: "w-1/3" },
                ].map((r) => (
                  <div key={r.role}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground">{r.role}</span>
                      <span className="text-muted">{r.desc}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-surface-3">
                      <div className={`h-1.5 rounded-full bg-primary ${r.w}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="ai" className="pb-20">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="default">
              <Bot className="h-3 w-3" />
              AI assistant
            </Badge>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight">
              An assistant that proposes — you decide
            </h2>
            <p className="mt-3 text-muted">
              TaskFlow&apos;s AI can summarize projects, turn feature descriptions into tasks, break
              down epics, recommend sprint scope, and explain overdue work. Recommendations are
              validated structured data and nothing is written without your explicit confirmation.
            </p>
          </div>
          <div className="mx-auto mt-8 grid max-w-4xl gap-3 md:grid-cols-3">
            {[
              "Summarize a project in seconds",
              "Generate tasks from a feature brief",
              "Break epics into stories & subtasks",
              "Suggest priorities with rationale",
              "Recommend the next task to pick up",
              "Flag scheduling risks early",
            ].map((t) => (
              <div
                key={t}
                className="flex items-center gap-2.5 rounded-lg border border-border-subtle bg-surface/60 px-4 py-3 text-sm text-muted"
              >
                <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
                {t}
              </div>
            ))}
          </div>
        </section>

        <section className="pb-20">
          <div className="rounded-xl border border-border-subtle bg-gradient-to-br from-primary-soft to-transparent p-10 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">Ready to ship together?</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted">
              Create your workspace in minutes. Invite your team, plan a sprint, and let TaskFlow
              keep everyone in sync.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Button size="lg" asChild>
                <Link href="/register">
                  Get started free
                  <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border-subtle">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted md:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-white">
              <Zap className="h-3 w-3" />
            </div>
            <span>TaskFlow — Plan smarter. Build faster. Ship together.</span>
          </div>
          <div className="flex gap-5">
            <Link href="/login" className="transition-colors hover:text-foreground">
              Sign in
            </Link>
            <Link href="/register" className="transition-colors hover:text-foreground">
              Create account
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
