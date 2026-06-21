package com.aichat.agent;

import com.aichat.config.AiChatProperties;
import com.aichat.dto.AgentResult;
import com.aichat.dto.ChatMessageDTO;
import com.aichat.dto.TaskContext;
import com.aichat.enums.TaskState;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Planning Agent - helps users formulate requirements and create task plans.
 * Uses AI API to analyze user requests and generate structured plans.
 */
@Component
public class PlanningAgent extends AbstractAgent {
    
    private static final Logger logger = LoggerFactory.getLogger(PlanningAgent.class);
    
    public PlanningAgent(AiChatProperties properties) {
        super(properties);
    }
    
    @Override
    public TaskState getState() {
        return TaskState.PLANNING;
    }
    
    @Override
    public String getSystemPrompt() {
        return """
            Ты на этапе ПЛАНИРОВАНИЯ. Твоя задача - помочь пользователю сформулировать требования и создать детальный план задачи.
            
            Правила:
            - Задавай уточняющие вопросы если требования неясны
            - Выделяй ключевые требования и ограничения
            - Создавай структурированный план с конкретными шагами
            - Определяй критерии успешного выполнения
            - Не переходи к реализации - только планирование
            - Когда все требования понятны, предложи перейти к реализации, если пользователь готов перейти к выполнению задачи, напиши "[ПЕРЕХОД К EXECUTION]"
            - Если план требует доработки, напиши "[ПЕРЕХОД К PLANNING]"
            - Тебе запрещено самому реализовывать и переходить на другие этапы
            
            Формат ответа:
            1. Понимание задачи (краткое описание)
            2. Требования (список)
            3. План реализации (пошагово)
            4. Критерии приемки
            5. Уточняющие вопросы (если есть)
            """;
    }
    
    @Override
    public AgentResult process(TaskContext context, ChatMessageDTO message) {
        logger.info("PlanningAgent processing message for session {}", context.getSessionId());
        
        String aiResponse = callAiApi(context, message);
        String extractedPlan = aiResponse != null ? aiResponse.trim() : null;
        
        AgentResult.Builder builder = AgentResult.builder()
                .content(extractedPlan)
                .metadataEntry("lastAgentResponse", aiResponse)
                .metadataEntry("draftPlan", extractedPlan);
        
        if (aiResponse != null) {
            if (aiResponse.contains("[ПЕРЕХОД К EXECUTION]")) {
                builder.suggestedNextState(TaskState.EXECUTION);
            } else if (aiResponse.contains("[ПЕРЕХОД К PLANNING]")) {
                builder.suggestedNextState(TaskState.PLANNING);
            }
        }
        
        return builder.build();
    }
    
    @Override
    public boolean canHandle(TaskState state) {
        return state == TaskState.PLANNING;
    }
    
    @Override
    protected Logger getLogger() {
        return logger;
    }
    
    @Override
    protected void addContextMessages(List<Map<String, String>> messages, TaskContext context) {
        // Add history if available
        if (context.getHistory() != null && !context.getHistory().isEmpty()) {
            for (ChatMessageDTO msg : context.getHistory()) {
                Map<String, String> msgMap = new HashMap<>();
                msgMap.put("role", msg.getRole());
                msgMap.put("content", msg.getContent());
                messages.add(msgMap);
            }
        }
    }
}
