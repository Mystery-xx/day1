package com.aichat.dto.support;

public class SupportChatRequest {
    private String ticketId;
    private String message;
    private String userId;
    
    public SupportChatRequest() {}
    
    public String getTicketId() { return ticketId; }
    public void setTicketId(String ticketId) { this.ticketId = ticketId; }
    
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
}
