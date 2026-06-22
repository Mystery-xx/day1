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
            - Выявляй конкретные несоответствия
            - Будь объективным - не принимай сторону
            - Если всё соответствует - подтверди успех
            - Если есть проблемы - перечисли конкретно
            - Тебе запрещено реализовывать, переделывать или закрывать задачу.
            
            Возможные следующие состояния:
            - DONE: если все пункты плана выполнены и тесты проходят
            - EXECUTION: если нужны исправления в реализации
            - PLANNING: если обнаружились новые требования или изменения в плане
            
            ВАЖНО: В конце ответа добавь ОДНУ из строк:
            - [ПЕРЕХОД К DONE] - если всё готово и можно завершать
            - [ПЕРЕХОД К EXECUTION] - если нужны исправления реализации без изменения плана
            - [ПЕРЕХОД К PLANNING] - если нужны изменения в плане или новые требования
            - [ПЕРЕХОД К VALIDATION] - если пользователь задает уточняющие вопросы по результату
            
            Формат ответа:
            1. Сравнение с планом (пункт за пунктом)
            2. Выявленные несоответствия (если есть)
            3. Рекомендация по следующему состоянию
           
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
        
        AgentResult.Builder builder = AgentResult.builder()
                .content(aiResponse)
                .metadataEntry("lastAgentResponse", aiResponse);
        
        if (aiResponse != null) {
            boolean hasTransitionToDone = aiResponse.contains("[ПЕРЕХОД К DONE]");
            boolean hasTransitionToExec = aiResponse.contains("[ПЕРЕХОД К EXECUTION]");
            boolean hasTransitionToPlanning = aiResponse.contains("[ПЕРЕХОД К PLANNING]");
            
            logger.info("ValidationAgent checking transition markers: toDone={}, toExec={}, toPlanning={}", 
                hasTransitionToDone, hasTransitionToExec, hasTransitionToPlanning);
            logger.info("AI response length: {}", aiResponse.length());
            
            TaskState nextState = TaskState.DONE;
            boolean needsRevision = false;
            
            if (hasTransitionToDone) {
                logger.info("ValidationAgent suggesting transition to DONE");
                nextState = TaskState.DONE;
                needsRevision = false;
            } else if (hasTransitionToPlanning) {
                logger.info("ValidationAgent suggesting transition to PLANNING");
                nextState = TaskState.PLANNING;
                needsRevision = true;
            } else if (hasTransitionToExec) {
                logger.info("ValidationAgent suggesting transition to EXECUTION");
                nextState = TaskState.EXECUTION;
                needsRevision = true;
            } else {
                logger.warn("No transition marker found in ValidationAgent response, defaulting to EXECUTION");
                nextState = TaskState.EXECUTION;
                needsRevision = true;
            }
            
            builder.suggestedNextState(nextState);
            builder.needsRevision(needsRevision);
            builder.metadataEntry("validationStatus", needsRevision ? ValidationResult.FAILED.name() : ValidationResult.OK.name());
            
            if (needsRevision) {
                builder.metadataEntry("validationIssues", aiResponse);
            }
        }
        
        return builder.build();
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
