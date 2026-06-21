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
            You are a PlanningAgent in a task orchestration state machine.
            Your task: gather requirements and create a plan.
            
            Important rules:
            - Ask clarifying questions if requirements are incomplete
            - When all requirements are clear and user is ready to proceed to implementation, write "[TRANSITION TO EXECUTION]" at the end of your response
            - If the plan needs revision, write "[TRANSITION TO PLANNING]"
            
            Response format:
            - Plan should be structured (requirements list, implementation steps)
            - Be specific, avoid vague phrases
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
            if (aiResponse.contains("[TRANSITION TO EXECUTION]")) {
                builder.suggestedNextState(TaskState.EXECUTION);
            } else if (aiResponse.contains("[TRANSITION TO PLANNING]")) {
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
