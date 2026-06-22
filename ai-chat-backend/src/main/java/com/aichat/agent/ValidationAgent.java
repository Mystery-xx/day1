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
            Ты на этапе ВАЛИДАЦИИ. Твоя задача - объективно проверить реализацию против плана и желаний пользователя
            
            Правила:
            - Сравни реализацию с каждым пунктом плана
            - Выявляй конкретные несоответствия
            - Будь объективным - не принимай сторону
            - Если всё соответствует - подтверди успех
            - Если есть проблемы - перечисли конкретно
            - Тебе запрещено реализовывать, переделывать или закрывать задачу.
            
            Возможные следующие состояния:
            - DONE: если все пункты плана выполнены и тесты проходят
            - EXECUTION: если нужны исправления в реализации
            - PLANNING: если обнаружились новые требования или изменения в плане
            """;
    }
    
    @Override
    public AgentResult process(TaskContext context, ChatMessageDTO message) {
        logger.info("ValidationAgent processing for session {}", context.getSessionId());
        
        if (context.getApprovedPlan() == null || context.getImplementation() == null) {
            return AgentResult.builder()
                    .content("Validation failed: Missing plan or implementation")
                    .needsRevision(true)
                    .suggestedNextState(TaskState.EXECUTION)
                    .metadataEntry("validationStatus", ValidationResult.FAILED.name())
                    .metadataEntry("error", "Missing plan or implementation")
                    .build();
        }
        
        String aiResponse = callAiApi(context, message);
        
        boolean aiRecommendsPlanning = aiResponse.toLowerCase().contains("состояние `planning`") ||
                                       aiResponse.toLowerCase().contains("перейти в состояние `planning`") ||
                                       aiResponse.toLowerCase().contains("необходимо перейти в состояние planning");
        
        boolean hasNewRequirements = aiResponse.toLowerCase().contains("новое требование") ||
                                    aiResponse.toLowerCase().contains("новый пункт") ||
                                    aiResponse.toLowerCase().contains("изменение плана") ||
                                    aiResponse.toLowerCase().contains("требуется изменение плана") ||
                                    aiResponse.toLowerCase().contains("обновить план") ||
                                    aiResponse.toLowerCase().contains("скорректировать план") ||
                                    aiRecommendsPlanning;
        
        boolean hasErrors = aiResponse.toLowerCase().contains("ошибка") || 
                           aiResponse.toLowerCase().contains("не соответствует") ||
                           aiResponse.toLowerCase().contains("проблема") ||
                           aiResponse.toLowerCase().contains("несоответствие") ||
                           aiResponse.toLowerCase().contains("❌");
        
        if (!hasErrors && !hasNewRequirements) {
            hasErrors = aiResponse.toLowerCase().contains("выявленные несоответствия") ||
                       aiResponse.toLowerCase().contains("диспропорция") ||
                       aiResponse.toLowerCase().contains("не выполнено");
        }
        
        ValidationResult result = hasErrors ? ValidationResult.FAILED : ValidationResult.OK;
        
        // Extract specific issues for ExecutionAgent to fix
        String issues = hasErrors ? extractIssues(aiResponse) : "";
        
        // Determine suggested next state
        TaskState nextState;
        if (!hasErrors) {
            // All tests pass - transition to DONE
            nextState = TaskState.DONE;
        } else if (hasNewRequirements) {
            // New requirements discovered - go back to PLANNING
            nextState = TaskState.PLANNING;
        } else {
            // Fixes needed - go back to EXECUTION
            nextState = TaskState.EXECUTION;
        }
        
        return AgentResult.builder()
                .content(aiResponse)
                .needsRevision(hasErrors)
                .suggestedNextState(nextState)
                .metadataEntry("validationStatus", result.name())
                .metadataEntry("validationIssues", issues)
                .metadataEntry("lastAgentResponse", aiResponse)
                .build();
    }
    
    private String extractIssues(String validationResponse) {
        // Extract the specific issues mentioned in validation response
        // This will be passed to ExecutionAgent for fixing
        return validationResponse.trim();
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
    protected Map<String, Object> buildRequestBody(String systemPrompt, String userMessage, TaskContext context) {
        Map<String, Object> requestBody = super.buildRequestBody(systemPrompt, userMessage, context);
        
        if (context.getApprovedPlan() != null && !context.getApprovedPlan().isBlank()) {
            List<Map<String, String>> messages = (List<Map<String, String>>) requestBody.get("messages");
            if (!messages.isEmpty()) {
                Map<String, String> systemMessage = messages.get(0);
                String currentContent = systemMessage.get("content");
                String planSection = "\n\n=== УТВЕРЖДЁННЫЙ ПЛАН ===\n" + context.getApprovedPlan();
                
                if (context.getImplementation() != null && !context.getImplementation().isBlank()) {
                    planSection += "\n\n=== РЕАЛИЗАЦИЯ ===\n" + context.getImplementation();
                }
                
                systemMessage.put("content", currentContent + planSection);
            }
        }
        
        return requestBody;
    }
    
    @Override
    protected void addContextMessages(List<Map<String, String>> messages, TaskContext context) {
    }
}
