package com.aichat.strategy;

import com.aichat.dto.ChatMessageDTO;
import com.aichat.dto.TaskContext;
import com.aichat.enums.TaskState;

import java.util.Optional;

/**
 * Strategy interface for detecting state transitions in agent-based task execution.
 * Implementations determine when to transition between task states based on context and user messages.
 */
public interface TransitionStrategy {
    
    /**
     * Detect if a state transition should occur based on the current context and user message.
     * 
     * @param context Current task context containing session state, plan, implementation, etc.
     * @param message The user's message that may trigger a transition
     * @param currentState The current task state
     * @return Optional containing the target state if transition is detected, empty otherwise
     */
    Optional<TaskState> detectTransition(TaskContext context, ChatMessageDTO message, TaskState currentState);
}
