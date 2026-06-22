-- Increase metadata_value column length to support longer AI responses
ALTER TABLE task_context_metadata ALTER COLUMN metadata_value VARCHAR(4000);
