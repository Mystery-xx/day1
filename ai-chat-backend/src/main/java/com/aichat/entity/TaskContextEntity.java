package com.aichat.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.Map;

/**
 * Entity representing persistent task context storage.
 * Stores approved plans, implementations, and validation results for chat sessions.
 */
@Entity
@Table(name = "task_context", indexes = {
    @Index(name = "idx_session_id", columnList = "session_id"),
    @Index(name = "idx_created_at", columnList = "created_at"),
    @Index(name = "idx_updated_at", columnList = "updated_at")
})
public class TaskContextEntity {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_id", nullable = false, unique = true)
    private ChatSession session;
    
    @Column(name = "approved_plan", columnDefinition = "TEXT")
    @Lob
    private String approvedPlan;
    
    @Column(name = "implementation", columnDefinition = "TEXT")
    @Lob
    private String implementation;
    
    @Column(name = "validation", columnDefinition = "TEXT")
    @Lob
    private String validation;
    
    @ElementCollection(fetch = FetchType.LAZY)
    @CollectionTable(name = "task_context_history", joinColumns = @JoinColumn(name = "task_context_id"))
    @MapKeyColumn(name = "history_key", length = 255)
    @Column(name = "history_value", columnDefinition = "TEXT")
    private Map<String, String> history;
    
    @ElementCollection(fetch = FetchType.LAZY)
    @CollectionTable(name = "task_context_metadata", joinColumns = @JoinColumn(name = "task_context_id"))
    @MapKeyColumn(name = "metadata_key", length = 255)
    @Column(name = "metadata_value", length = 1000)
    private Map<String, String> metadata;
    
    @Column(name = "needs_revision", nullable = false)
    private Boolean needsRevision = false;
    
    @Column(name = "paused", nullable = false)
    private boolean paused = false;
    
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
    
    @Column(name = "updated_at")
    private Instant updatedAt;
    
    public TaskContextEntity() {
    }
    
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public ChatSession getSession() {
        return session;
    }
    
    public void setSession(ChatSession session) {
        this.session = session;
    }
    
    public String getApprovedPlan() {
        return approvedPlan;
    }
    
    public void setApprovedPlan(String approvedPlan) {
        this.approvedPlan = approvedPlan;
    }
    
    public String getImplementation() {
        return implementation;
    }
    
    public void setImplementation(String implementation) {
        this.implementation = implementation;
    }
    
    public String getValidation() {
        return validation;
    }
    
    public void setValidation(String validation) {
        this.validation = validation;
    }
    
    public Map<String, String> getHistory() {
        return history;
    }
    
    public void setHistory(Map<String, String> history) {
        this.history = history;
    }
    
    public Map<String, String> getMetadata() {
        return metadata;
    }
    
    public void setMetadata(Map<String, String> metadata) {
        this.metadata = metadata;
    }
    
    public Boolean getNeedsRevision() {
        return needsRevision;
    }
    
    public void setNeedsRevision(Boolean needsRevision) {
        this.needsRevision = needsRevision;
    }
    
    public boolean isPaused() {
        return paused;
    }
    
    public void setPaused(boolean paused) {
        this.paused = paused;
    }
    
    public Instant getCreatedAt() {
        return createdAt;
    }
    
    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
    
    public Instant getUpdatedAt() {
        return updatedAt;
    }
    
    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
    
    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
        if (needsRevision == null) {
            needsRevision = false;
        }
    }
    
    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }
}
