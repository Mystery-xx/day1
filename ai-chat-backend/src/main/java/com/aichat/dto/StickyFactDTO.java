package com.aichat.dto;

import java.time.Instant;
import com.fasterxml.jackson.annotation.JsonProperty;

public class StickyFactDTO {
    private Long id;
    private String sessionId;
    private String factKey;
    private String factValue;
    @JsonProperty(access = JsonProperty.Access.READ_ONLY)
    private Long createdAtEpoch;
    @JsonProperty(access = JsonProperty.Access.READ_ONLY)
    private Long updatedAtEpoch;
    private boolean isAutoExtracted;
    
    // Transient fields for deserialization
    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    private Instant createdAt;
    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    private Instant updatedAt;

    public StickyFactDTO() {
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
        this.createdAtEpoch = createdAt != null ? createdAt.toEpochMilli() : null;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
        this.updatedAtEpoch = updatedAt != null ? updatedAt.toEpochMilli() : null;
    }

    public Long getCreatedAtEpoch() {
        return createdAtEpoch;
    }

    public void setCreatedAtEpoch(Long createdAtEpoch) {
        this.createdAtEpoch = createdAtEpoch;
    }

    public Long getUpdatedAtEpoch() {
        return updatedAtEpoch;
    }

    public void setUpdatedAtEpoch(Long updatedAtEpoch) {
        this.updatedAtEpoch = updatedAtEpoch;
    }

    public boolean isAutoExtracted() {
        return isAutoExtracted;
    }

    public void setAutoExtracted(boolean autoExtracted) {
        isAutoExtracted = autoExtracted;
    }
}
