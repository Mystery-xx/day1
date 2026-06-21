package com.aichat.dto;

import com.aichat.enums.TaskState;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Unified result DTO for agent responses.
 * Contains generated content, metadata, and revision flag.
 * Immutable builder pattern for thread-safety and consistency.
 */
public class AgentResult {
    private final String content;
    private final Map<String, Object> metadata;
    private final boolean needsRevision;
    private final Optional<TaskState> suggestedNextState;

    private AgentResult(Builder builder) {
        this.content = builder.content;
        this.metadata = builder.metadata != null ? new HashMap<>(builder.metadata) : new HashMap<>();
        this.needsRevision = builder.needsRevision;
        this.suggestedNextState = builder.suggestedNextState != null ? builder.suggestedNextState : Optional.empty();
    }

    /**
     * Constructor with content only.
     * Metadata is empty, needsRevision is false, suggestedNextState is empty.
     */
    public AgentResult(String content) {
        this.content = content;
        this.metadata = new HashMap<>();
        this.needsRevision = false;
        this.suggestedNextState = Optional.empty();
    }

    /**
     * Constructor with content and needsRevision flag.
     * Metadata is empty, suggestedNextState is empty.
     */
    public AgentResult(String content, boolean needsRevision) {
        this.content = content;
        this.metadata = new HashMap<>();
        this.needsRevision = needsRevision;
        this.suggestedNextState = Optional.empty();
    }

    public String getContent() {
        return content;
    }

    public Map<String, Object> getMetadata() {
        return new HashMap<>(metadata);
    }

    public boolean isNeedsRevision() {
        return needsRevision;
    }

    public Optional<TaskState> getSuggestedNextState() {
        return suggestedNextState;
    }

    /**
     * Create a new AgentResult with updated content.
     */
    public AgentResult withContent(String content) {
        return new Builder(this)
            .withContent(content)
            .build();
    }

    /**
     * Create a new AgentResult with updated needsRevision flag.
     */
    public AgentResult withNeedsRevision(boolean needsRevision) {
        return new Builder(this)
            .withNeedsRevision(needsRevision)
            .build();
    }

    /**
     * Add a single metadata entry.
     */
    public AgentResult withMetadataEntry(String key, Object value) {
        Map<String, Object> newMetadata = new HashMap<>(this.metadata);
        newMetadata.put(key, value);
        return new Builder(this)
            .withMetadata(newMetadata)
            .build();
    }

    /**
     * Create a new AgentResult with updated suggestedNextState.
     */
    public AgentResult withSuggestedNextState(TaskState suggestedNextState) {
        return new Builder(this)
            .suggestedNextState(suggestedNextState)
            .build();
    }

    public static Builder builder() {
        return new Builder();
    }

    public static Builder builder(AgentResult existing) {
        return new Builder(existing);
    }

    public static class Builder {
        private String content;
        private Map<String, Object> metadata;
        private boolean needsRevision;
        private Optional<TaskState> suggestedNextState;

        public Builder() {
            this.metadata = new HashMap<>();
            this.needsRevision = false;
            this.suggestedNextState = Optional.empty();
        }

        public Builder(AgentResult existing) {
            this.content = existing.content;
            this.metadata = existing.metadata != null ? new HashMap<>(existing.metadata) : new HashMap<>();
            this.needsRevision = existing.needsRevision;
            this.suggestedNextState = existing.suggestedNextState != null ? existing.suggestedNextState : Optional.empty();
        }

        public Builder content(String content) {
            this.content = content;
            return this;
        }

        public Builder metadata(Map<String, Object> metadata) {
            this.metadata = metadata != null ? new HashMap<>(metadata) : new HashMap<>();
            return this;
        }

        public Builder metadataEntry(String key, Object value) {
            if (this.metadata == null) {
                this.metadata = new HashMap<>();
            }
            this.metadata.put(key, value);
            return this;
        }

        public Builder needsRevision(boolean needsRevision) {
            this.needsRevision = needsRevision;
            return this;
        }

        public Builder withContent(String content) {
            this.content = content;
            return this;
        }

        public Builder withMetadata(Map<String, Object> metadata) {
            this.metadata = metadata != null ? new HashMap<>(metadata) : new HashMap<>();
            return this;
        }

        public Builder withMetadataEntry(String key, Object value) {
            return metadataEntry(key, value);
        }

        public Builder withNeedsRevision(boolean needsRevision) {
            this.needsRevision = needsRevision;
            return this;
        }

        public Builder suggestedNextState(TaskState state) {
            this.suggestedNextState = state != null ? Optional.of(state) : Optional.empty();
            return this;
        }

        public AgentResult build() {
            return new AgentResult(this);
        }
    }
}
