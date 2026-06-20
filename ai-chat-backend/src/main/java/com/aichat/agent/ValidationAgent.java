package com.aichat.agent;

import com.aichat.config.AiChatProperties;
import com.aichat.dto.AgentResult;
import com.aichat.dto.ChatMessageDTO;
import com.aichat.dto.TaskContext;
import com.aichat.dto.ValidationResult;
import com.aichat.enums.TaskState;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
public class ValidationAgent extends AbstractAgent {
    
    private static final Logger logger = LoggerFactory.getLogger(ValidationAgent.class);
    
    public ValidationAgent(AiChatProperties properties) {
        super(properties);
    }
    
    @Override
    public TaskState getState() {
        return TaskState.VALIDATION;
    }
    
    @Override
    public String getSystemPrompt() {
        return """
            Ты на этапе ВАЛИДАЦИИ. Проверь решение против утверждённого плана.
            Сравни реализацию с планом. Выявляй несоответствия. Будь объективным.
            """;
    }
    
    @Override
    public AgentResult process(TaskContext context, ChatMessageDTO message) {
        logger.info("ValidationAgent processing for session {}", context.getSessionId());
        
        if (context.getApprovedPlan() == null || context.getImplementation() == null) {
            return AgentResult.builder()
                    .content("Validation failed: Missing plan or implementation")
                    .needsRevision(true)
                    .metadataEntry("validationStatus", ValidationResult.FAILED.name())
                    .metadataEntry("error", "Missing plan or implementation")
                    .build();
        }
        
        String aiResponse = callAiApi(context, message);
        ValidationResult result = aiResponse.toLowerCase().contains("ошибка") || 
                                  aiResponse.toLowerCase().contains("не соответствует") 
                                  ? ValidationResult.FAILED : ValidationResult.OK;
        
        return AgentResult.builder()
                .content(aiResponse)
                .needsRevision(result == ValidationResult.FAILED)
                .metadataEntry("validationStatus", result.name())
                .metadataEntry("lastAgentResponse", aiResponse)
                .build();
    }
    
    @Override
    public boolean canHandle(TaskState state) {
        return state == TaskState.VALIDATION;
    }
    
    @Override
    protected Logger getLogger() {
        return logger;
    }
    
    @Override
    protected void addContextMessages(List<Map<String, String>> messages, TaskContext context) {
        if (context.getApprovedPlan() != null) {
            Map<String, String> planMsg = new HashMap<>();
            planMsg.put("role", "system");
            planMsg.put("content", "=== ПЛАН ===\n" + context.getApprovedPlan());
            messages.add(planMsg);
        }
        if (context.getImplementation() != null) {
            Map<String, String> implMsg = new HashMap<>();
            implMsg.put("role", "system");
            implMsg.put("content", "=== РЕАЛИЗАЦИЯ ===\n" + context.getImplementation());
            messages.add(implMsg);
        }
    }
}
