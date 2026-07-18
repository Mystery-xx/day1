package com.aichat.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "chat_message", indexes = {
    @Index(name = "idx_session_id", columnList = "sessionId"),
    @Index(name = "idx_created_at", columnList = "createdAt")
})
public class ChatMessage {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "session_id", nullable = false, length = 255)
    private String sessionId;
    
    @Column(nullable = false, length = 50)
    @Enumerated(EnumType.STRING)
    private Role role;
    
    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;
    
    @Column(length = 255)
    private String model;
    
    @Column(name = "prompt_tokens")
    private Integer promptTokens;
    
    @Column(name = "completion_tokens")
    private Integer completionTokens;
    
    @Column(name = "total_tokens")
    private Integer totalTokens;
    
    @Column(name = "response_time_ms")
    private Integer responseTimeMs;
    
    @Column(length = 50)
    private String provider;
    
    @Column
    private Double temperature;
    
    @Column(name = "max_tokens")
    private Integer maxTokens;
    
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
    
    @Column(name = "summary", columnDefinition = "TEXT")
    private String summary;
    
    @Column(name = "tool_calls", columnDefinition = "JSON")
    private String toolCallsJson;
    
    @Column(name = "tool_results", columnDefinition = "JSON")
    private String toolResultsJson;
    
    public enum Role {
        USER, ASSISTANT, SYSTEM
    }
    
    public ChatMessage() {
    }
    
    // Getters and Setters
    
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
    
    public Role getRole() {
        return role;
    }
    
    public void setRole(Role role) {
        this.role = role;
    }
    
    public String getContent() {
        return content;
    }
    
    public void setContent(String content) {
        this.content = content;
    }
    
    public String getModel() {
        return model;
    }
    
    public void setModel(String model) {
        this.model = model;
    }
    
    public Integer getPromptTokens() {
        return promptTokens;
    }
    
    public void setPromptTokens(Integer promptTokens) {
        this.promptTokens = promptTokens;
    }
    
    public Integer getCompletionTokens() {
        return completionTokens;
    }
    
    public void setCompletionTokens(Integer completionTokens) {
        this.completionTokens = completionTokens;
    }
    
    public Integer getTotalTokens() {
        return totalTokens;
    }
    
    public void setTotalTokens(Integer totalTokens) {
        this.totalTokens = totalTokens;
    }
    
    public Integer getResponseTimeMs() {
        return responseTimeMs;
    }
    
    public void setResponseTimeMs(Integer responseTimeMs) {
        this.responseTimeMs = responseTimeMs;
    }
    
    public String getProvider() {
        return provider;
    }
    
    public void setProvider(String provider) {
        this.provider = provider;
    }
    
    public Double getTemperature() {
        return temperature;
    }
    
    public void setTemperature(Double temperature) {
        this.temperature = temperature;
    }
    
    public Integer getMaxTokens() {
        return maxTokens;
    }
    
    public void setMaxTokens(Integer maxTokens) {
        this.maxTokens = maxTokens;
    }
    
    public Instant getCreatedAt() {
        return createdAt;
    }
    
    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
    
    public String getSummary() {
        return summary;
    }
    
    public void setSummary(String summary) {
        this.summary = summary;
    }

    public String getToolCallsJson() {
        return toolCallsJson;
    }

    public void setToolCallsJson(String toolCallsJson) {
        this.toolCallsJson = toolCallsJson;
    }

    public String getToolResultsJson() {
        return toolResultsJson;
    }

    public void setToolResultsJson(String toolResultsJson) {
        this.toolResultsJson = toolResultsJson;
    }
}
