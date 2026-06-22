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
import java.util.Objects;

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
                - Когда все требования понятны, предложи перейти к реализации
                - Если пользователь готов перейти к выполнению задачи, напиши "[ПЕРЕХОД К EXECUTION]"
                - Тебе запрещено самому реализовывать и переходить на другие этапы
                
                ВНИМАНИЕ: Переход к EXECUTION возможен ТОЛЬКО при одновременном выполнении условий:
                1. ПЛАН СОСТАВЛЕН (есть "План реализации" с конкретными шагами)
                2. УТОЧНЯЮЩИХ ВОПРОСОВ НЕТ (нет секции "Уточняющие вопросы" ИЛИ она пустая)
                
                Триггеры перехода:
                - Пользователь написал "согласен", "ок", "окей", "давай", "приступай", "реализуй", "утверждаю", "подтверждаю", "начинай"
                - ИЛИ план готов и пользователь явно согласился
                
                Если план готов и триггер сработал - ТЫ ДОЛЖЕН добавить строку "[ПЕРЕХОД К EXECUTION]" в конце своего ответа. Это ОБЯЗАТЕЛЬНО.
                
                ВАЖНО: Не добавляй маркер если:
                - План ещё не готов / неполный
                - Есть уточняющие вопросы без ответа
                - Пользователь задаёт вопросы по плану но не дал команду выполнять
                
                Формат ответа:
                Понимание задачи (краткое описание)
                Требования (список)
                План реализации (пошагово)
                Критерии приемки
                Уточняющие вопросы (если есть)
                [ПЕРЕХОД К EXECUTION] (ТОЛЬКО если нет уточняющих вопросов и пользователь согласен с планом)
                """;
    }

    @Override
    public AgentResult process(TaskContext context, ChatMessageDTO message) {
        logger.info("PlanningAgent processing message for session {} and message {}", context.getSessionId(), message.getContent());

        String aiResponse = callAiApi(context, message);
        String extractedPlan = aiResponse != null ? aiResponse.trim() : null;

        AgentResult.Builder builder = AgentResult.builder()
                .content(extractedPlan)
                .metadataEntry("lastAgentResponse", aiResponse)
                .metadataEntry("draftPlan", extractedPlan);
        logger.info("aiResponse is null {} {}", aiResponse == null, aiResponse != null && aiResponse.contains("[ПЕРЕХОД К EXECUTION]"));
        logger.info("aiResponse is \n{}", aiResponse);
        if (aiResponse != null) {
            boolean hasTransitionToExec = aiResponse.contains("[TRANSITION TO EXECUTION]") || aiResponse.contains("[ПЕРЕХОД К EXECUTION]");
            //boolean hasTransitionToPlanning = aiResponse.contains("[TRANSITION TO PLANNING]") || aiResponse.contains("[ПЕРЕХОД К PLANNING]");
            logger.info("PlanningAgent checking transition markers: toExec={}", hasTransitionToExec);
            logger.info("AI response length: {}, contains transition marker: {}", aiResponse.length(), hasTransitionToExec);

            if (hasTransitionToExec) {
                logger.info("PlanningAgent suggesting transition to EXECUTION");
                builder.suggestedNextState(TaskState.EXECUTION);
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
