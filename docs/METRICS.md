# TaskFlow metrics definitions

Every number shown in TaskFlow reports is computed **only from persisted records**
(issues, sprints, activity events, and sprint membership history). Nothing is sampled,
extrapolated, or cached from demo data. This document is the source of truth for how
each metric is derived; the implementations live in `src/lib/services/sprint.ts` and
`src/lib/services/analytics.ts`.

## Vocabulary

- **Scope** — issues that were attached to a sprint at some point (tracked in the
  `SprintIssue` membership history with `addedAt`/`removedAt`, not just the issue's
  current `sprintId`).
- **Done** — issue `statusCategory = DONE` (the board column category, not a hard-coded
  status string).
- **Points** — `Issue.storyPoints` (nullable; treated as 0 when null).

## Sprint report

### Totals

| Field | Definition |
| --- | --- |
| `scopeIssues` | Count of issues ever added to the sprint (per `SprintIssue` history) |
| `completedIssues` | Scope issues with `statusCategory = DONE` at report time |
| `carriedOver` | Scope issues not done when the sprint completed and moved forward |
| `scopePoints` | Sum of story points over scope issues |
| `completedPoints` | Sum of story points over completed issues |
| `completionPct` | `completedIssues / scopeIssues` (0 when scope is empty) |

### Burndown

For each day from the sprint's start date through its end (or `completedAt`):

1. **Remaining** — the number of scope issues that were *not yet DONE at the end of that
   day*. Completion time is reconstructed by replaying activity events
   (`issue.status_changed` and legacy `issue.moved` records whose `metadata.to` maps to a
   DONE category; `issue.created` marks scope entry). Issues that are currently DONE but
   have no replayable event are assumed to have completed at sprint end (conservative).
2. **Ideal** — a straight line from the initial scope (at day 0) to 0 (at the last day),
   i.e. `initialScope * (1 - day / totalDays)`.

Scope changes (issues added/removed mid-sprint) are listed as `scopeChanges`
(`±1` per issue with timestamps) so the chart can be audited against real history.

### Velocity

Per **completed** sprint: `completedPoints` (also snapshotted into the
`sprint.completed` activity metadata at completion time, so historical velocity does not
change when issues are later edited). The velocity report returns each completed sprint's
points plus a rolling **average over the last 6 completed sprints**.

## Project metrics

| Field | Definition |
| --- | --- |
| `totalIssues` | Non-deleted issues in the project |
| `openIssues` / `doneIssues` | Split by `statusCategory` |
| `completionPct` | `doneIssues / totalIssues` |
| `overdueIssues` | Open issues with `dueDate` before now |
| `byType`, `byPriority`, `byStatus` | Counts grouped by the corresponding column |
| `avgCycleTimeDays` | For done issues with `startDate` and completion activity: mean of (completed − started) in days |

## Workspace dashboard

Counts of projects, issues assigned to the current user, open issues, overdue issues,
recent activity (from the `Activity` table), and upcoming due dates — all scoped to one
workspace and filtered by membership. My Tasks = issues assigned to the current user in
that workspace.

## Why activity replay (not issue snapshots)?

Issues are mutable: re-prioritizing an issue today must not rewrite last month's
burndown. TaskFlow therefore reconstructs point-in-time state from append-only activity
events, with issue rows as a fallback for data written before an event existed. Trade-off:
status changes made through paths that don't record `issue.status_changed` would be
invisible — all mutation paths (issue update, board move, bulk set-status) record it.

## Calendar / timeline / overdue

- **Overdue** — `dueDate < now` and not DONE.
- **Timeline** — projects/milestones/sprints positioned by their date ranges
  (`startDate`/`targetDate`, sprint `startDate`/`endDate`, milestone `date`).
- **Calendar** — issues with `startDate`/`dueDate`, sprints, and milestones placed by date.

All of the above read the same tables; there is no separate analytics store.
