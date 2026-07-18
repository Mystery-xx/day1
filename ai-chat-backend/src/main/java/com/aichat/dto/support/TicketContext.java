package com.aichat.dto.support;

public class TicketContext {
    private String ticketId;
    private String subject;
    private String status;
    private String priority;
    private String userName;
    private String userEmail;
    private String userPlan;
    
    public TicketContext() {}
    
    public String getTicketId() { return ticketId; }
    public void setTicketId(String ticketId) { this.ticketId = ticketId; }
    
    public String getSubject() { return subject; }
    public void setSubject(String subject) { this.subject = subject; }
    
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    
    public String getPriority() { return priority; }
    public void setPriority(String priority) { this.priority = priority; }
    
    public String getUserName() { return userName; }
    public void setUserName(String userName) { this.userName = userName; }
    
    public String getUserEmail() { return userEmail; }
    public void setUserEmail(String userEmail) { this.userEmail = userEmail; }
    
    public String getUserPlan() { return userPlan; }
    public void setUserPlan(String userPlan) { this.userPlan = userPlan; }
}
