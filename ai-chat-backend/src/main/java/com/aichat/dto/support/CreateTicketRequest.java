package com.aichat.dto.support;

/**
 * DTO for creating a new support ticket.
 */
public class CreateTicketRequest {

    private String subject;
    private String description;
    private String priority;
    private String userId;

    public CreateTicketRequest() {}

    public String getSubject() {
        return subject;
    }

    public void setSubject(String subject) {
        this.subject = subject;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getPriority() {
        return priority;
    }

    public void setPriority(String priority) {
        this.priority = priority;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }
}
