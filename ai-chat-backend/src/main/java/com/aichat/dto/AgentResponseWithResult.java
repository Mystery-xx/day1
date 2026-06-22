package com.aichat.dto;

import com.aichat.entity.ChatSession;

/**
 * Wrapper DTO containing both TaskContext and AgentResult.
 * Used by TaskOrchestrator to return complete processing result.
 */
public class AgentResponseWithResult {
    private final TaskContext taskContext;
    private final AgentResult agentResult;

    public AgentResponseWithResult(TaskContext taskContext, AgentResult agentResult) {
        this.taskContext = taskContext;
        this.agentResult = agentResult;
    }

    public TaskContext getTaskContext() {
        return taskContext;
    }

    public AgentResult getAgentResult() {
        return agentResult;
    }

    /**
     * Get the agent's response content.
     * Convenience method for agentResult.getContent().
     */
    public String getContent() {
        return agentResult != null ? agentResult.getContent() : null;
    }
}
