package com.aichat.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "sticky_fact", indexes = {
    @Index(name = "idx_sticky_fact_session_id", columnList = "sessionId")
})
public class StickyFact {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "session_id", nullable = false, length = 255)
    private String sessionId;

    @Column(name = "fact_key", nullable = false, length = 255)
    private String factKey;

    @Column(name = "fact_value", nullable = false, columnDefinition = "TEXT")
    private String factValue;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at")
    private Instant updatedAt;

    @Column(name = "is_auto_extracted", nullable = false, columnDefinition = "BOOLEAN DEFAULT FALSE")
    private boolean isAutoExtracted = false;

    public StickyFact() {
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public String getFactKey() {
        return factKey;
    }

    public void setFactKey(String factKey) {
        this.factKey = factKey;
    }

    public String getFactValue() {
        return factValue;
    }

    public void setFactValue(String factValue) {
        this.factValue = factValue;
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

    public boolean isAutoExtracted() {
        return isAutoExtracted;
    }

    public void setAutoExtracted(boolean autoExtracted) {
        isAutoExtracted = autoExtracted;
    }
}
