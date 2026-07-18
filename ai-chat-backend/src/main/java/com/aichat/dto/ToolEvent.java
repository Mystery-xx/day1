package com.aichat.dto;

import java.util.Map;

/**
 * DTO for MCP tool execution events streamed via SSE.
 * Used to notify frontend about tool lifecycle during AI conversation.
 */
public class ToolEvent {
    
    private String type;          // "toolCall", "toolResult", "toolError"
    private String toolName;      // Name of the tool being called
    private String toolId;        // Unique identifier for this tool call
    private Map<String, Object> arguments;  // Tool arguments (for toolCall)
    private Object result;        // Tool execution result (for toolResult)
    private String error;         // Error message (for toolError)
    private Long timestamp;       // Event timestamp
    
    public ToolEvent() {
        this.timestamp = System.currentTimeMillis();
    }
    
    public ToolEvent(String type, String toolName) {
        this();
        this.type = type;
        this.toolName = toolName;
    }
    
    // Getters and Setters
    
    public String getType() {
        return type;
    }
    
    public void setType(String type) {
        this.type = type;
    }
    
    public String getToolName() {
        return toolName;
    }
    
    public void setToolName(String toolName) {
        this.toolName = toolName;
    }
    
    public String getToolId() {
        return toolId;
    }
    
    public void setToolId(String toolId) {
        this.toolId = toolId;
    }
    
    public Map<String, Object> getArguments() {
        return arguments;
    }
    
    public void setArguments(Map<String, Object> arguments) {
        this.arguments = arguments;
    }
    
    public Object getResult() {
        return result;
    }
    
    public void setResult(Object result) {
        this.result = result;
    }
    
    public String getError() {
        return error;
    }
    
    public void setError(String error) {
        this.error = error;
    }
    
    public Long getTimestamp() {
        return timestamp;
    }
    
    public void setTimestamp(Long timestamp) {
        this.timestamp = timestamp;
    }
    
    // Static factory methods for common event types
    
    public static ToolEvent toolCall(String toolName, String toolId, Map<String, Object> arguments) {
        ToolEvent event = new ToolEvent("toolCall", toolName);
        event.setToolId(toolId);
        event.setArguments(arguments);
        return event;
    }
    
    public static ToolEvent toolResult(String toolName, String toolId, Object result) {
        ToolEvent event = new ToolEvent("toolResult", toolName);
        event.setToolId(toolId);
        event.setResult(result);
        return event;
    }
    
    public static ToolEvent toolError(String toolName, String toolId, String error) {
        ToolEvent event = new ToolEvent("toolError", toolName);
        event.setToolId(toolId);
        event.setError(error);
        return event;
    }
}
