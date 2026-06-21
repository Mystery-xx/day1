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
public class DoneAgent extends AbstractAgent {
    
    private static final Logger logger = LoggerFactory.getLogger(DoneAgent.class);
    
    public DoneAgent(AiChatProperties properties) {
        super(properties);
    }
    
    @Override
    public TaskState getState() {
        return TaskState.DONE;
    }
    
    @Override
    public String getSystemPrompt() {
        return """
            Задача ЗАВЕРШЕНА. Отвечай на дополнительные вопросы по готовому решению.
            
            [STATE_TRANSITION: DONE] - Если пользователь задаёт уточняющие вопросы, оставайся в DONE.
            [STATE_TRANSITION: PLANNING] - Если нужны изменения/новая задача, предложи начать новый цикл планирования.
            """;
    }
    
    @Override
    public AgentResult process(TaskContext context, ChatMessageDTO message) {
        logger.info("DoneAgent processing for session {}", context.getSessionId());
        
        String aiResponse = callAiApi(context, message);
        boolean needsRevision = userWantsChanges(message.getContent());
        
        // Suggest PLANNING when new requirements, otherwise stay in DONE
        TaskState nextState = needsRevision ? TaskState.PLANNING : TaskState.DONE;
        
        return AgentResult.builder()
                .content(aiResponse)
                .needsRevision(needsRevision)
                .suggestedNextState(nextState)
                .metadataEntry("lastAgentResponse", aiResponse)
                .build();
    }
    
    @Override
    public boolean canHandle(TaskState state) {
        return state == TaskState.DONE;
    }
    
    @Override
    protected Logger getLogger() {
        return logger;
    }
    
    @Override
    protected void addContextMessages(List<Map<String, String>> messages, TaskContext context) {
        StringBuilder summary = new StringBuilder("=== ЗАВЕРШЁННАЯ ЗАДАЧА ===\n");
        if (context.getApprovedPlan() != null) {
            summary.append("План: ").append(context.getApprovedPlan()).append("\n");
        }
        if (context.getImplementation() != null) {
            summary.append("Реализация: ").append(context.getImplementation()).append("\n");
        }
        
        Map<String, String> summaryMsg = new HashMap<>();
        summaryMsg.put("role", "system");
        summaryMsg.put("content", summary.toString());
        messages.add(summaryMsg);
    }
    
    private boolean userWantsChanges(String message) {
        if (message == null) return false;
        String lower = message.toLowerCase();
        return lower.contains("нужно дополнить") || lower.contains("добавить") || 
               lower.contains("изменить") || lower.contains("новая задача");
    }
}
