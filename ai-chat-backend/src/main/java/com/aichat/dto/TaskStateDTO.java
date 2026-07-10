package com.aichat.dto;

import com.aichat.entity.TaskStatus;

import java.time.Instant;
import java.util.List;

public class TaskStateDTO {
    private Long id;
    private String sessionId;
    private String goal;
    private TaskStatus status;
    private List<ConstraintDTO> constraints;
    private List<ClarificationDTO> clarifications;
    private Instant createdAt;
    private Instant updatedAt;

    public TaskStateDTO() {
    }

    public TaskStateDTO(Long id, String sessionId, String goal, TaskStatus status,
                        List<ConstraintDTO> constraints, List<ClarificationDTO> clarifications,
                        Instant createdAt, Instant updatedAt) {
        this.id = id;
        this.sessionId = sessionId;
        this.goal = goal;
        this.status = status;
        this.constraints = constraints;
        this.clarifications = clarifications;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
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

    public String getGoal() {
        return goal;
    }

    public void setGoal(String goal) {
        this.goal = goal;
    }

    public TaskStatus getStatus() {
        return status;
    }

    public void setStatus(TaskStatus status) {
        this.status = status;
    }

    public List<ConstraintDTO> getConstraints() {
        return constraints;
    }

    public void setConstraints(List<ConstraintDTO> constraints) {
        this.constraints = constraints;
    }

    public List<ClarificationDTO> getClarifications() {
        return clarifications;
    }

    public void setClarifications(List<ClarificationDTO> clarifications) {
        this.clarifications = clarifications;
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
}
