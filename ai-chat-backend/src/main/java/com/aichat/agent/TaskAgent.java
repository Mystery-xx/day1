package com.aichat.agent;

import com.aichat.dto.AgentResult;
import com.aichat.dto.TaskContext;
import com.aichat.dto.ChatMessageDTO;
import com.aichat.enums.TaskState;

/**
 * Base interface for all task agents in the state machine.
 * Each agent is responsible for processing messages in its specific state.
 */
public interface TaskAgent {
    
    /**
     * Get the task state this agent handles.
     * @return The TaskState this agent is responsible for
     */
    TaskState getState();
    
    /**
     * Get the system prompt for this agent.
     * The system prompt defines the agent's role and behavior.
     * @return System prompt string
     */
    String getSystemPrompt();
    
    /**
     * Process a chat message in the context of the current task state.
     * The agent may update the context with new information.
     * 
     * @param context Current task context
     * @param message User message to process
     * @return AgentResult with generated content and metadata
     */
    AgentResult process(TaskContext context, ChatMessageDTO message);
    
    /**
     * Check if this agent can handle the given task state.
     * @param state The state to check
     * @return true if this agent can handle the state
     */
    boolean canHandle(TaskState state);
}
