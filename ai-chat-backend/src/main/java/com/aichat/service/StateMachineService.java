package com.aichat.service;

import com.aichat.agent.AgentFactory;
import com.aichat.agent.TaskAgent;
import com.aichat.dto.AgentResult;
import com.aichat.dto.TaskContext;
import com.aichat.dto.ChatMessageDTO;
import com.aichat.entity.ChatSession;
import com.aichat.enums.TaskState;
import com.aichat.repository.ChatSessionRepository;
import com.aichat.service.ChatHistoryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/**
 * Service for managing task state machine and agent switching.
 * Orchestrates agent selection, message processing, and state transitions.
 */
@Service
@Transactional
public class StateMachineService {
    
    private static final Logger logger = LoggerFactory.getLogger(StateMachineService.class);
    
    private final AgentFactory agentFactory;
    private final ChatSessionRepository sessionRepository;
    private final AutoTransitionDetector transitionDetector;
    private final ChatHistoryService historyService;
    
    public StateMachineService(AgentFactory agentFactory, 
                               ChatSessionRepository sessionRepository,
                               AutoTransitionDetector transitionDetector,
                               ChatHistoryService historyService) {
        this.agentFactory = agentFactory;
        this.sessionRepository = sessionRepository;
        this.transitionDetector = transitionDetector;
        this.historyService = historyService;
    }
    
    /**
     * Get the current agent for a session.
     * Auto-creates session if not found.
     * @param sessionId Session ID
     * @return Current agent for the session's state
     */
    public TaskAgent getCurrentAgent(String sessionId) {
        ChatSession session = sessionRepository.findBySessionId(sessionId).orElse(null);
        
        if (session == null) {
            logger.info("Session not found in getCurrentAgent, auto-creating: {}", sessionId);
            String newSessionId = historyService.createSession();
            session = sessionRepository.findBySessionId(newSessionId)
                .orElseThrow(() -> new IllegalStateException("Failed to create session"));
        }
        
        return agentFactory.getAgent(session.getTaskState());
    }
    
    /**
     * Process a message with the current agent and handle auto-transitions.
     * Auto-creates session if not found.
     * @param sessionId Session ID
     * @param message User message
     * @return Updated task context
     */
    public TaskContext processMessage(String sessionId, ChatMessageDTO message) {
        ChatSession session = sessionRepository.findBySessionId(sessionId).orElse(null);
        
        if (session == null) {
            logger.info("Session not found, auto-creating: {}", sessionId);
            String newSessionId = historyService.createSession();
            session = sessionRepository.findBySessionId(newSessionId)
                .orElseThrow(() -> new IllegalStateException("Failed to create session"));
            logger.info("Auto-created session {} with PLANNING state", sessionId);
        }
        
        TaskAgent currentAgent = agentFactory.getAgent(session.getTaskState());
        TaskContext context = createInitialContext(session);
        AgentResult result = currentAgent.process(context, message);
        TaskContext processedContext = updateContextWithResult(context, result);
        
        Optional<TaskState> nextState = transitionDetector.detect(processedContext, message);
        
        if (nextState.isPresent()) {
            TaskState targetState = nextState.get();
            if (session.getTaskState().isValidTransition(targetState)) {
                transitionTo(sessionId, targetState, "Auto-transition detected from message");
                processedContext = processedContext.withState(targetState);
            }
        }
        
        return processedContext;
    }
    
    private TaskContext updateContextWithResult(TaskContext context, AgentResult result) {
        TaskContext updated = context;
        
        if (context.getCurrentState() == TaskState.PLANNING) {
            updated = updated.withPlan(result.getContent());
        } else if (context.getCurrentState() == TaskState.EXECUTION) {
            updated = updated.withImplementation(result.getContent());
        }
        
        for (var entry : result.getMetadata().entrySet()) {
            updated = updated.withMetadataEntry(entry.getKey(), entry.getValue());
        }
        
        if (result.isNeedsRevision()) {
            updated = updated.withNeedsRevision(true);
        }
        
        return updated;
    }
    
    /**
     * Transition session to a new state.
     * @param sessionId Session ID
     * @param newState Target state
     * @param reason Reason for transition
     */
    public void transitionTo(String sessionId, TaskState newState, String reason) {
        ChatSession session = sessionRepository.findBySessionId(sessionId).orElse(null);
        
        if (session == null) {
            logger.warn("Session not found in transitionTo, cannot transition: {}", sessionId);
            throw new IllegalArgumentException("Session not found: " + sessionId);
        }
        
        TaskState oldState = session.getTaskState();
        
        if (!oldState.isValidTransition(newState)) {
            throw new IllegalStateException(
                String.format("Invalid transition from %s to %s", oldState, newState)
            );
        }
        
        session.setTaskState(newState);
        sessionRepository.save(session);
        
        TaskAgent oldAgent = agentFactory.getAgent(oldState);
        TaskAgent newAgent = agentFactory.getAgent(newState);
        
        logger.info("Transition: {} → {} | Agent: {} → {} | Session: {} | Reason: {}",
            oldState.getDisplayName(),
            newState.getDisplayName(),
            oldAgent.getClass().getSimpleName(),
            newAgent.getClass().getSimpleName(),
            sessionId,
            reason
        );
    }
    
    /**
     * Get current task state for a session.
     * Auto-creates session if not found.
     * @param sessionId Session ID
     * @return Current task state
     */
    public TaskState getCurrentState(String sessionId) {
        ChatSession session = sessionRepository.findBySessionId(sessionId).orElse(null);
        
        if (session == null) {
            logger.info("Session not found in getCurrentState, auto-creating: {}", sessionId);
            String newSessionId = historyService.createSession();
            session = sessionRepository.findBySessionId(newSessionId)
                .orElseThrow(() -> new IllegalStateException("Failed to create session"));
        }
        
        return session.getTaskState();
    }
    
    /**
     * Create initial task context for a session.
     */
    private TaskContext createInitialContext(ChatSession session) {
        return TaskContext.builder()
            .sessionId(session.getSessionId())
            .currentState(session.getTaskState())
            .build();
    }
}
