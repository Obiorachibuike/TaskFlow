-- Fix: board columns are per-project. The workspace-level unique key
-- (`BoardColumn_workspaceId_key_key`) incorrectly blocked creating a second
-- project in a workspace because every project seeds the same default column
-- keys (backlog/todo/in_progress/in_review/done). Keep only (projectId, key).
-- The init migration created this as a plain UNIQUE INDEX, so drop the index
-- (and defensively the constraint, in case it was added as one).
DROP INDEX IF EXISTS "BoardColumn_workspaceId_key_key";
ALTER TABLE "BoardColumn" DROP CONSTRAINT IF EXISTS "BoardColumn_workspaceId_key_key";
