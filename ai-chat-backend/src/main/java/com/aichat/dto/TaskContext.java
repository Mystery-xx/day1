package com.aichat.dto;

import com.aichat.entity.TaskContextEntity;
import com.aichat.enums.TaskState;

import java.util.*;

/**
 * Task context for transferring data between agents during state transitions.
 * Immutable builder pattern for thread-safety and consistency.
 */
public class TaskContext {
    private final String sessionId;
    private final TaskState currentState;
    private String approvedPlan;          // Planning → Execution
    private String implementation;        // Execution → Validation
    private ValidationResult validation;  // Validation → Done/Planning
    private List<ChatMessageDTO> history;
    private Map<String, Object> metadata;
    private boolean needsRevision;        // Done → Planning flag

    private TaskContext(Builder builder) {
        this.sessionId = builder.sessionId;
        this.currentState = builder.currentState;
        this.approvedPlan = builder.approvedPlan;
        this.implementation = builder.implementation;
        this.validation = builder.validation;
        this.history = builder.history != null ? new ArrayList<>(builder.history) : new ArrayList<>();
        this.metadata = builder.metadata != null ? new HashMap<>(builder.metadata) : new HashMap<>();
        this.needsRevision = builder.needsRevision;
    }

    public String getSessionId() {
        return sessionId;
    }

    public TaskState getCurrentState() {
        return currentState;
    }

    public String getApprovedPlan() {
        return approvedPlan;
    }

    public String getImplementation() {
        return implementation;
    }

    public ValidationResult getValidation() {
        return validation;
    }

    public List<ChatMessageDTO> getHistory() {
        return new ArrayList<>(history);
    }

    public Map<String, Object> getMetadata() {
        return new HashMap<>(metadata);
    }

    public boolean isNeedsRevision() {
        return needsRevision;
    }

    /**
     * Create a new TaskContext with updated approved plan.
     */
    public TaskContext withPlan(String approvedPlan) {
        return new Builder(this)
            .withApprovedPlan(approvedPlan)
            .build();
    }

    /**
     * Create a new TaskContext with updated implementation.
     */
    public TaskContext withImplementation(String implementation) {
        return new Builder(this)
            .withImplementation(implementation)
            .build();
    }

    /**
     * Create a new TaskContext with updated validation result.
     */
    public TaskContext withValidation(ValidationResult validation) {
        return new Builder(this)
            .withValidation(validation)
            .build();
    }

    /**
     * Create a new TaskContext with updated history.
     */
    public TaskContext withHistory(List<ChatMessageDTO> history) {
        return new Builder(this)
            .withHistory(history)
            .build();
    }

    /**
     * Create a new TaskContext with updated metadata.
     */
    public TaskContext withMetadata(Map<String, Object> metadata) {
        return new Builder(this)
            .withMetadata(metadata)
            .build();
    }

    /**
     * Create a new TaskContext with needsRevision flag.
     */
    public TaskContext withNeedsRevision(boolean needsRevision) {
        return new Builder(this)
            .withNeedsRevision(needsRevision)
            .build();
    }

    /**
     * Create a new TaskContext with updated current state.
     */
    public TaskContext withState(TaskState state) {
        return new Builder(this)
            .withCurrentState(state)
            .build();
    }

    /**
     * Add a single metadata entry.
     */
    public TaskContext withMetadataEntry(String key, Object value) {
        Map<String, Object> newMetadata = new HashMap<>(this.metadata);
        newMetadata.put(key, value);
        return new Builder(this)
            .withMetadata(newMetadata)
            .build();
    }

    /**
     * Remove a single metadata entry (for cleanup after use).
     */
    public TaskContext withoutMetadataEntry(String key) {
        Map<String, Object> newMetadata = new HashMap<>(this.metadata);
        newMetadata.remove(key);
        return new Builder(this)
            .withMetadata(newMetadata)
            .build();
    }

    public static Builder builder() {
        return new Builder();
    }

    public static Builder builder(TaskContext existing) {
        return new Builder(existing);
    }

    /**
     * Convert this DTO to a TaskContextEntity.
     * Note: Does not include session relationship - caller must set it.
     */
    public TaskContextEntity toEntity() {
        TaskContextEntity entity = new TaskContextEntity();
        entity.setApprovedPlan(this.approvedPlan);
        entity.setImplementation(this.implementation);
        entity.setValidation(this.validation != null ? this.validation.name() : null);
        entity.setNeedsRevision(this.needsRevision);

        // Convert history List<ChatMessageDTO> to Map<String, String>
        if (this.history != null && !this.history.isEmpty()) {
            Map<String, String> historyMap = new HashMap<>();
            for (int i = 0; i < this.history.size(); i++) {
                ChatMessageDTO msg = this.history.get(i);
                historyMap.put("msg_" + i, msg.getRole() + ": " + msg.getContent());
            }
            entity.setHistory(historyMap);
        }

        // Convert metadata Map<String, Object> to Map<String, String>
        if (this.metadata != null && !this.metadata.isEmpty()) {
            Map<String, String> metadataMap = new HashMap<>();
            for (Map.Entry<String, Object> entry : this.metadata.entrySet()) {
                metadataMap.put(entry.getKey(), entry.getValue() != null ? entry.getValue().toString() : null);
            }
            entity.setMetadata(metadataMap);
        }

        return entity;
    }

    /**
     * Create a TaskContext DTO from a TaskContextEntity.
     */
    public static TaskContext fromEntity(TaskContextEntity entity) {
        if (entity == null) {
            return null;
        }

        // Convert history Map<String, String> to List<ChatMessageDTO>
        List<ChatMessageDTO> history = new ArrayList<>();
        if (entity.getHistory() != null) {
            for (String value : entity.getHistory().values()) {
                if (value != null && value.contains(": ")) {
                    String[] parts = value.split(": ", 2);
                    if (parts.length == 2) {
                        history.add(new ChatMessageDTO(parts[0], parts[1]));
                    }
                }
            }
        }

        // Convert metadata Map<String, String> to Map<String, Object>
        Map<String, Object> metadata = new HashMap<>();
        if (entity.getMetadata() != null) {
            metadata.putAll(entity.getMetadata());
        }

        // Parse validation result from string
        ValidationResult validation = null;
        if (entity.getValidation() != null) {
            try {
                validation = ValidationResult.valueOf(entity.getValidation());
            } catch (IllegalArgumentException e) {
                validation = null;
            }
        }

        return new Builder()
            .withApprovedPlan(entity.getApprovedPlan())
            .withImplementation(entity.getImplementation())
            .withValidation(validation)
            .withHistory(history)
            .withMetadata(metadata)
            .withNeedsRevision(entity.getNeedsRevision() != null && entity.getNeedsRevision())
            .build();
    }

    public static class Builder {
        private String sessionId;
        private TaskState currentState;
        private String approvedPlan;
        private String implementation;
        private ValidationResult validation;
        private List<ChatMessageDTO> history;
        private Map<String, Object> metadata;
        private boolean needsRevision;

        public Builder() {
            this.history = new ArrayList<>();
            this.metadata = new HashMap<>();
            this.needsRevision = false;
        }

        public Builder(TaskContext existing) {
            this.sessionId = existing.sessionId;
            this.currentState = existing.currentState;
            this.approvedPlan = existing.approvedPlan;
            this.implementation = existing.implementation;
            this.validation = existing.validation;
            this.history = existing.history != null ? new ArrayList<>(existing.history) : new ArrayList<>();
            this.metadata = existing.metadata != null ? new HashMap<>(existing.metadata) : new HashMap<>();
            this.needsRevision = existing.needsRevision;
        }

        public Builder sessionId(String sessionId) {
            this.sessionId = sessionId;
            return this;
        }

        public Builder currentState(TaskState currentState) {
            this.currentState = currentState;
            return this;
        }

        public Builder withApprovedPlan(String approvedPlan) {
            this.approvedPlan = approvedPlan;
            return this;
        }

        public Builder withImplementation(String implementation) {
            this.implementation = implementation;
            return this;
        }

        public Builder withValidation(ValidationResult validation) {
            this.validation = validation;
            return this;
        }

        public Builder withHistory(List<ChatMessageDTO> history) {
            this.history = history != null ? new ArrayList<>(history) : new ArrayList<>();
            return this;
        }

        public Builder withMetadata(Map<String, Object> metadata) {
            this.metadata = metadata != null ? new HashMap<>(metadata) : new HashMap<>();
            return this;
        }

        public Builder withNeedsRevision(boolean needsRevision) {
            this.needsRevision = needsRevision;
            return this;
        }

        public Builder withCurrentState(TaskState state) {
            this.currentState = state;
            return this;
        }

        public TaskContext build() {
            return new TaskContext(this);
        }
    }
}
