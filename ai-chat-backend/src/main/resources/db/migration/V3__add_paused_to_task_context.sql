-- Add paused column to task_context table
ALTER TABLE task_context ADD COLUMN IF NOT EXISTS paused BOOLEAN NOT NULL DEFAULT FALSE;
