package com.aichat.dto;

import java.time.Instant;

public class SessionInfoDTO {
    private String sessionId;
    private Long messageCount;
    private Instant createdAt;
    private Instant lastMessageAt;
    private String preview;
    
    public SessionInfoDTO() {
    }
    
    public String getSessionId() {
        return sessionId;
    }
    
    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }
    
    public Long getMessageCount() {
        return messageCount;
    }
    
    public void setMessageCount(Long messageCount) {
        this.messageCount = messageCount;
    }
    
    public Instant getCreatedAt() {
        return createdAt;
    }
    
    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
    
    public Instant getLastMessageAt() {
        return lastMessageAt;
    }
    
    public void setLastMessageAt(Instant lastMessageAt) {
        this.lastMessageAt = lastMessageAt;
    }
    
    public String getPreview() {
        return preview;
    }
    
    public void setPreview(String preview) {
        this.preview = preview;
    }
}
