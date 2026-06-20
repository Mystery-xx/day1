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
        return """
            Ты на этапе ВЫПОЛНЕНИЯ. Реализуй задачу согласно утверждённому плану.
            Следуй плану строго. Предоставляй рабочий код. Объясняй ключевые решения.
            """;
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
    
    @Override
    protected void addContextMessages(List<Map<String, String>> messages, TaskContext context) {
        if (context.getApprovedPlan() != null) {
            Map<String, String> planMsg = new HashMap<>();
            planMsg.put("role", "user");
            planMsg.put("content", "Контекст задачи:\n\n=== ПЛАН ===\n" + context.getApprovedPlan());
            messages.add(planMsg);
        }
    }
    
}
