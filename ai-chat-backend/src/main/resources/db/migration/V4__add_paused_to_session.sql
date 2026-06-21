-- Add paused column to chat_session table
ALTER TABLE chat_session ADD COLUMN IF NOT EXISTS paused BOOLEAN NOT NULL DEFAULT FALSE;
