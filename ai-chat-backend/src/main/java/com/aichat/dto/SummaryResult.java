package com.aichat.dto;

import java.util.Map;

public class SummaryResult {
    private String summaryText;
    private Map<String, Object> request;
    private Map<String, Object> response;
    
    public SummaryResult() {}
    
    public SummaryResult(String summaryText, Map<String, Object> request, Map<String, Object> response) {
        this.summaryText = summaryText;
        this.request = request;
        this.response = response;
    }
    
    public String getSummaryText() {
        return summaryText;
    }
    
    public void setSummaryText(String summaryText) {
        this.summaryText = summaryText;
    }
    
    public Map<String, Object> getRequest() {
        return request;
    }
    
    public void setRequest(Map<String, Object> request) {
        this.request = request;
    }
    
    public Map<String, Object> getResponse() {
        return response;
    }
    
    public void setResponse(Map<String, Object> response) {
        this.response = response;
    }
}
