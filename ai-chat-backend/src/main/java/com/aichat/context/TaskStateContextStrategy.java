package com.aichat.context;

import com.aichat.dto.ChatMessageDTO;
import com.aichat.dto.ChatRequest;
import com.aichat.dto.ClarificationDTO;
import com.aichat.dto.ConstraintDTO;
import com.aichat.dto.TaskStateDTO;
import com.aichat.service.TaskStateService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@Service
public class TaskStateContextStrategy implements ContextStrategy {

    private static final Logger logger = LoggerFactory.getLogger(TaskStateContextStrategy.class);

    private final TaskStateService taskStateService;

    public TaskStateContextStrategy(TaskStateService taskStateService) {
        this.taskStateService = taskStateService;
    }

    @Override
    public List<ChatMessageDTO> buildContext(String sessionId, ChatRequest.ModelSettings settings) {
        logger.debug("Building task state context for session {}", sessionId);
        
        TaskStateDTO taskState;
        try {
            taskState = taskStateService.getTaskState(sessionId);
        } catch (RuntimeException e) {
            logger.debug("No task state found for session {}, returning empty context", sessionId);
            return Collections.emptyList();
        }
        
        if (taskState == null || taskState.getGoal() == null) {
            logger.debug("Task state is null or goal is null for session {}, returning empty context", sessionId);
            return Collections.emptyList();
        }

        String contextContent = buildContextContent(taskState);
        logger.info("Including task state context for session {}: goal={}, status={}", 
                    sessionId, taskState.getGoal(), taskState.getStatus());

        ChatMessageDTO systemMessage = new ChatMessageDTO();
        systemMessage.setSessionId(sessionId);
        systemMessage.setRole("system");
        systemMessage.setContent(contextContent);
        
        return Collections.singletonList(systemMessage);
    }

    private String buildContextContent(TaskStateDTO ts) {
        StringBuilder sb = new StringBuilder();
        
        sb.append("Task Goal: ").append(ts.getGoal()).append("\n\n");
        sb.append("Task Status: ").append(ts.getStatus()).append("\n");
        
        if (ts.getConstraints() != null && !ts.getConstraints().isEmpty()) {
            sb.append("\nConstraints:\n");
            for (ConstraintDTO c : ts.getConstraints()) {
                sb.append("- ").append(c.getType()).append(": ").append(c.getDescription()).append("\n");
            }
        }
        
        if (ts.getClarifications() != null && !ts.getClarifications().isEmpty()) {
            sb.append("\nRecent Clarifications:\n");
            for (ClarificationDTO cl : ts.getClarifications()) {
                sb.append("- Q: ").append(cl.getQuestion()).append(" A: ").append(cl.getAnswer()).append("\n");
            }
        }
        
        return sb.toString();
    }
}
