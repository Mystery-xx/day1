package com.aichat.dto;

/**
 * DTO for exposing task state information to the frontend.
 * Used by the StatePanel component to display current agent state.
 */
public class TaskStateDTO {
    private final String state;
    private final String displayName;
    private final int order;
    private final String agentClass;

    public TaskStateDTO(String state, String displayName, int order, String agentClass) {
        this.state = state;
        this.displayName = displayName;
        this.order = order;
        this.agentClass = agentClass;
    }

    public String getState() {
        return state;
    }

    public String getDisplayName() {
        return displayName;
    }

    public int getOrder() {
        return order;
    }

    public String getAgentClass() {
        return agentClass;
    }
}
