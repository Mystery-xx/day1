-- Update task_context table to match TaskContextEntity
-- Add new columns for approved_plan, implementation, validation, needs_revision

-- Add new columns to task_context table
ALTER TABLE task_context ADD COLUMN IF NOT EXISTS approved_plan TEXT;
ALTER TABLE task_context ADD COLUMN IF NOT EXISTS implementation TEXT;
ALTER TABLE task_context ADD COLUMN IF NOT EXISTS validation TEXT;
ALTER TABLE task_context ADD COLUMN IF NOT EXISTS needs_revision BOOLEAN NOT NULL DEFAULT FALSE;

-- Rename existing columns (if they exist and need to be migrated)
-- planning_context -> keep for backward compatibility, data can be migrated manually if needed
-- execution_context -> keep for backward compatibility
-- validation_context -> keep for backward compatibility

-- Create task_context_history table for ElementCollection
CREATE TABLE IF NOT EXISTS task_context_history (
    task_context_id BIGINT NOT NULL,
    history_key VARCHAR(255) NOT NULL,
    history_value TEXT,
    PRIMARY KEY (task_context_id, history_key),
    FOREIGN KEY (task_context_id) REFERENCES task_context(id) ON DELETE CASCADE
);

-- Create task_context_metadata table for ElementCollection
CREATE TABLE IF NOT EXISTS task_context_metadata (
    task_context_id BIGINT NOT NULL,
    metadata_key VARCHAR(255) NOT NULL,
    metadata_value VARCHAR(1000),
    PRIMARY KEY (task_context_id, metadata_key),
    FOREIGN KEY (task_context_id) REFERENCES task_context(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_task_context_session_id ON task_context(session_id);
CREATE INDEX IF NOT EXISTS idx_task_context_created_at ON task_context(created_at);
CREATE INDEX IF NOT EXISTS idx_task_context_updated_at ON task_context(updated_at);
CREATE INDEX IF NOT EXISTS idx_task_context_history_task_id ON task_context_history(task_context_id);
CREATE INDEX IF NOT EXISTS idx_task_context_metadata_task_id ON task_context_metadata(task_context_id);
