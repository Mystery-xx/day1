package com.aichat.agent;

import com.aichat.enums.TaskState;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * Factory for creating/retrieving task agents by state.
 * Spring component that manages all agent instances.
 */
@Component
public class AgentFactory {
    
    private final Map<TaskState, TaskAgent> agents;
    
    public AgentFactory(List<TaskAgent> agentList) {
        this.agents = agentList.stream()
            .collect(java.util.stream.Collectors.toMap(
                TaskAgent::getState,
                agent -> agent
            ));
    }
    
    /**
     * Get the agent responsible for the given task state.
     * @param state The task state
     * @return The agent responsible for that state
     * @throws IllegalArgumentException if no agent is found for the state
     */
    public TaskAgent getAgent(TaskState state) {
        TaskAgent agent = agents.get(state);
        if (agent == null) {
            throw new IllegalArgumentException("No agent found for state: " + state);
        }
        return agent;
    }
    
    /**
     * Get all registered agents.
     * @return Map of state to agent
     */
    public Map<TaskState, TaskAgent> getAllAgents() {
        return Map.copyOf(agents);
    }
}
