package com.aichat.enums;

/**
 * Task state machine states for agent-based task execution.
 * Each state corresponds to a specific agent responsible for that phase.
 */
public enum TaskState {
    PLANNING(1, "Planning", "PlanningAgent"),
    EXECUTION(2, "Execution", "ExecutionAgent"),
    VALIDATION(3, "Validation", "ValidationAgent"),
    DONE(4, "Done", "DoneAgent");

    private final int order;
    private final String displayName;
    private final String agentClass;

    TaskState(int order, String displayName, String agentClass) {
        this.order = order;
        this.displayName = displayName;
        this.agentClass = agentClass;
    }

    public int getOrder() {
        return order;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getAgentClass() {
        return agentClass;
    }

    /**
     * Check if transition from this state to target state is valid.
     * Valid transitions:
     * - PLANNING → EXECUTION
     * - EXECUTION → VALIDATION
     * - VALIDATION → EXECUTION, DONE, PLANNING
     * - DONE → PLANNING (only for new requirements)
     */
    public boolean isValidTransition(TaskState to) {
        if (to == null) {
            return false;
        }
        
        return switch (this) {
            case PLANNING -> to == EXECUTION;
            case EXECUTION -> to == VALIDATION;
            case VALIDATION -> to == EXECUTION || to == DONE || to == PLANNING;
            case DONE -> to == PLANNING;
        };
    }
}
