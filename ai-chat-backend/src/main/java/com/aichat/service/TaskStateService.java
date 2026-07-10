package com.aichat.service;

import com.aichat.dto.ClarificationDTO;
import com.aichat.dto.ConstraintDTO;
import com.aichat.dto.TaskStateDTO;
import com.aichat.entity.TaskState;
import com.aichat.entity.TaskStatus;
import com.aichat.repository.TaskStateRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Service
@Transactional
public class TaskStateService {

    private final TaskStateRepository repository;
    private final ObjectMapper objectMapper;

    public TaskStateService(TaskStateRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    public TaskStateDTO getOrCreateTaskState(String sessionId) {
        Optional<TaskState> existing = repository.findBySessionId(sessionId);
        if (existing.isPresent()) {
            return toDTO(existing.get());
        }
        
        // Create new task state with status CLARIFYING
        TaskState newState = new TaskState();
        newState.setSessionId(sessionId);
        newState.setGoal("");
        newState.setStatus(TaskStatus.CLARIFYING);
        newState.setConstraintsJson("[]");
        newState.setClarificationsJson("[]");
        newState.setCreatedAt(Instant.now());
        newState.setUpdatedAt(Instant.now());
        
        return toDTO(repository.save(newState));
    }

    public TaskStateDTO updateGoal(String sessionId, String goal) {
        TaskState state = repository.findBySessionId(sessionId)
                .orElseThrow(() -> new RuntimeException("TaskState not found for sessionId: " + sessionId));
        state.setGoal(goal);
        state.setUpdatedAt(Instant.now());
        return toDTO(repository.save(state));
    }

    public TaskStateDTO addConstraint(String sessionId, ConstraintDTO constraint) {
        TaskState state = repository.findBySessionId(sessionId)
                .orElseThrow(() -> new RuntimeException("TaskState not found for sessionId: " + sessionId));
        
        List<ConstraintDTO> constraints = parseConstraints(state.getConstraintsJson());
        constraints.add(constraint);
        state.setConstraintsJson(toJson(constraints));
        state.setUpdatedAt(Instant.now());
        
        return toDTO(repository.save(state));
    }

    public TaskStateDTO addClarification(String sessionId, String question, String answer) {
        TaskState state = repository.findBySessionId(sessionId)
                .orElseThrow(() -> new RuntimeException("TaskState not found for sessionId: " + sessionId));
        
        List<ClarificationDTO> clarifications = parseClarifications(state.getClarificationsJson());
        ClarificationDTO clarification = new ClarificationDTO(question, answer, Instant.now());
        clarifications.add(clarification);
        state.setClarificationsJson(toJson(clarifications));
        state.setUpdatedAt(Instant.now());
        
        return toDTO(repository.save(state));
    }

    public TaskStateDTO updateStatus(String sessionId, TaskStatus status) {
        TaskState state = repository.findBySessionId(sessionId)
                .orElseThrow(() -> new RuntimeException("TaskState not found for sessionId: " + sessionId));
        state.setStatus(status);
        state.setUpdatedAt(Instant.now());
        return toDTO(repository.save(state));
    }

    public TaskStateDTO getTaskState(String sessionId) {
        TaskState state = repository.findBySessionId(sessionId).orElse(null);
        if (state == null) {
            return null;
        }
        return toDTO(state);
    }

    public void deleteTaskState(String sessionId) {
        repository.deleteBySessionId(sessionId);
    }

    private TaskStateDTO toDTO(TaskState entity) {
        TaskStateDTO dto = new TaskStateDTO();
        dto.setId(entity.getId());
        dto.setSessionId(entity.getSessionId());
        dto.setGoal(entity.getGoal());
        dto.setStatus(entity.getStatus());
        dto.setConstraints(parseConstraints(entity.getConstraintsJson()));
        dto.setClarifications(parseClarifications(entity.getClarificationsJson()));
        dto.setCreatedAt(entity.getCreatedAt());
        dto.setUpdatedAt(entity.getUpdatedAt());
        return dto;
    }

    private List<ConstraintDTO> parseConstraints(String json) {
        if (json == null || json.trim().isEmpty()) {
            return new ArrayList<>();
        }
        try {
            List<ConstraintDTO> constraints = objectMapper.readValue(json, new TypeReference<List<ConstraintDTO>>() {});
            return constraints != null ? constraints : new ArrayList<>();
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    private List<ClarificationDTO> parseClarifications(String json) {
        if (json == null || json.trim().isEmpty()) {
            return new ArrayList<>();
        }
        try {
            List<ClarificationDTO> clarifications = objectMapper.readValue(json, new TypeReference<List<ClarificationDTO>>() {});
            return clarifications != null ? clarifications : new ArrayList<>();
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    private String toJson(Object obj) {
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (Exception e) {
            throw new RuntimeException("Failed to serialize object to JSON", e);
        }
    }
}
