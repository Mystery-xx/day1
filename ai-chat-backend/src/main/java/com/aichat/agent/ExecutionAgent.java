package com.aichat.agent;

import com.aichat.config.AiChatProperties;
import com.aichat.dto.AgentResult;
import com.aichat.dto.ChatMessageDTO;
import com.aichat.dto.TaskContext;
import com.aichat.enums.TaskState;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
public class ExecutionAgent extends AbstractAgent {
    
    private static final Logger logger = LoggerFactory.getLogger(ExecutionAgent.class);
    
    public ExecutionAgent(AiChatProperties properties) {
        super(properties);
    }
    
    @Override
    public TaskState getState() {
        return TaskState.EXECUTION;
    }
    
    @Override
    public String getSystemPrompt() {
        String basePrompt = """
            Ты на этапе ВЫПОЛНЕНИЯ. Твоя единственная задача - реализовать утверждённый план.
            
            Правила:
            - Следуй плану строго, не отклоняйся
            - Предоставляй готовый рабочий код
            - Объясняй ключевые решения кратко
            - Не задавай уточняющих вопросов - просто реализуй
            - Если план неполный - Сообщи об этом, но продолжай с максимальной точностью
            """;
        
        return basePrompt;
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
                
                Object validationIssuesObj = context.getMetadata().get("validationIssues");
                String validationIssues = validationIssuesObj != null ? validationIssuesObj.toString() : null;
                if (validationIssues != null && !validationIssues.isBlank()) {
                    planSection += "\n\n=== ЗАМЕЧАНИЯ ВАЛИДАЦИИ ===\n";
                    planSection += "Следующие проблемы требуют исправления:\n" + validationIssues;
                    planSection += "\n\nИсправь эти проблемы строго, сохраняя соответствие плану.";
                }
                
                systemMessage.put("content", currentContent + planSection);
            }
        }
        
        return requestBody;
    }
    
    @Override
    public AgentResult process(TaskContext context, ChatMessageDTO message) {
        logger.info("ExecutionAgent processing for session {}", context.getSessionId());
        
        if (context.getApprovedPlan() == null) {
            return AgentResult.builder()
                    .content("Error: No approved plan")
                    .needsRevision(false)
                    .build();
        }
        
        String aiResponse = callAiApi(context, message);
        return AgentResult.builder()
                .content(aiResponse)
                .needsRevision(false)
                .build();
    }
    
    @Override
    public boolean canHandle(TaskState state) {
        return state == TaskState.EXECUTION;
    }
    
    @Override
    protected Logger getLogger() {
        return logger;
    }
    
}
