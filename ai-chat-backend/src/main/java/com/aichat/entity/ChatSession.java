package com.aichat.entity;

import com.aichat.enums.TaskState;
import jakarta.persistence.*;
import java.time.Instant;

/**
 * Entity representing a chat session with task state machine support.
 * Each session has a task state that determines which agent is active.
 */
@Entity
@Table(name = "chat_session", indexes = {
    @Index(name = "idx_session_id", columnList = "sessionId"),
    @Index(name = "idx_task_state", columnList = "task_state"),
    @Index(name = "idx_created_at", columnList = "createdAt")
})
public class ChatSession {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "session_id", nullable = false, unique = true, length = 255)
    private String sessionId;
    
    @Column(name = "task_state", nullable = false, length = 50)
    @Enumerated(EnumType.STRING)
    private TaskState taskState = TaskState.PLANNING;
    
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
    
    @Column(name = "updated_at")
    private Instant updatedAt;
    
    @Column(name = "title", length = 500)
    private String title;
    
    public ChatSession() {
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
    
    public TaskState getTaskState() {
        return taskState;
    }
    
    public void setTaskState(TaskState taskState) {
        this.taskState = taskState;
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
    
    public String getTitle() {
        return title;
    }
    
    public void setTitle(String title) {
        this.title = title;
    }
    
    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
        if (taskState == null) {
            taskState = TaskState.PLANNING;
        }
    }
    
    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }
}
