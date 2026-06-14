package com.aichat.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.Map;

public class ChatResponse {
    private String content;
    private String error;
    private String model;
    private Map<String, Object> usage;
    
    @JsonProperty("debugRequest")
    private Object debugRequest;
    
    @JsonProperty("debugResponse")
    private Object debugResponse;
    
    @JsonProperty("debugSummaryRequest")
    private Object debugSummaryRequest;
    
    @JsonProperty("debugSummaryResponse")
    private Object debugSummaryResponse;
    
    @JsonProperty("debugStickyFacts")
    private Object debugStickyFacts;
    
    @JsonProperty("stickyFactsUpdated")
    private Boolean stickyFactsUpdated;
    
    @JsonProperty("sessionTotalPromptTokens")
    private Integer sessionTotalPromptTokens;
    
    @JsonProperty("sessionTotalCompletionTokens")
    private Integer sessionTotalCompletionTokens;
    
    @JsonProperty("sessionTotalTokens")
    private Integer sessionTotalTokens;

    public ChatResponse() {}

    public ChatResponse(String content, String error) {
        this.content = content;
        this.error = error;
    }

    public ChatResponse(String content, String error, String model, Map<String, Object> usage) {
        this.content = content;
        this.error = error;
        this.model = model;
        this.usage = usage;
    }

    public static ChatResponse success(String content) {
        return new ChatResponse(content, null);
    }

    public static ChatResponse error(String error) {
        return new ChatResponse(null, error);
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getError() {
        return error;
    }

    public void setError(String error) {
        this.error = error;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public Map<String, Object> getUsage() {
        return usage;
    }

    public void setUsage(Map<String, Object> usage) {
        this.usage = usage;
    }

    public Object getDebugRequest() {
        return debugRequest;
    }

    public void setDebugRequest(Object debugRequest) {
        this.debugRequest = debugRequest;
    }

    public Object getDebugResponse() {
        return debugResponse;
    }

    public void setDebugResponse(Object debugResponse) {
        this.debugResponse = debugResponse;
    }

    public Object getDebugSummaryRequest() {
        return debugSummaryRequest;
    }

    public void setDebugSummaryRequest(Object debugSummaryRequest) {
        this.debugSummaryRequest = debugSummaryRequest;
    }

    public Object getDebugSummaryResponse() {
        return debugSummaryResponse;
    }

    public void setDebugSummaryResponse(Object debugSummaryResponse) {
        this.debugSummaryResponse = debugSummaryResponse;
    }

    public Object getDebugStickyFacts() {
        return debugStickyFacts;
    }

    public void setDebugStickyFacts(Object debugStickyFacts) {
        this.debugStickyFacts = debugStickyFacts;
    }

    public Boolean getStickyFactsUpdated() {
        return stickyFactsUpdated;
    }

    public void setStickyFactsUpdated(Boolean stickyFactsUpdated) {
        this.stickyFactsUpdated = stickyFactsUpdated;
    }

    public Integer getSessionTotalPromptTokens() {
        return sessionTotalPromptTokens;
    }

    public void setSessionTotalPromptTokens(Integer sessionTotalPromptTokens) {
        this.sessionTotalPromptTokens = sessionTotalPromptTokens;
    }

    public Integer getSessionTotalCompletionTokens() {
        return sessionTotalCompletionTokens;
    }

    public void setSessionTotalCompletionTokens(Integer sessionTotalCompletionTokens) {
        this.sessionTotalCompletionTokens = sessionTotalCompletionTokens;
    }

    public Integer getSessionTotalTokens() {
        return sessionTotalTokens;
    }

    public void setSessionTotalTokens(Integer sessionTotalTokens) {
        this.sessionTotalTokens = sessionTotalTokens;
    }
}
