package com.aichat.service;

import com.aichat.agent.AgentFactory;
import com.aichat.agent.TaskAgent;
import com.aichat.dto.AgentResult;
import com.aichat.dto.AgentResponseWithResult;
import com.aichat.dto.ChatMessageDTO;
import com.aichat.dto.TaskContext;
import com.aichat.entity.ChatSession;
import com.aichat.entity.TaskContextEntity;
import com.aichat.enums.TaskState;
import com.aichat.repository.ChatSessionRepository;
import com.aichat.repository.TaskContextRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Service for orchestrating task execution with stateful context management.
 * Replaces StateMachineService with database-backed context persistence.
 * Orchestrates agent selection, message processing, context updates, and state transitions.
 */
@Service
@Transactional
public class TaskOrchestrator {
    
    private static final Logger logger = LoggerFactory.getLogger(TaskOrchestrator.class);
    
    private final AgentFactory agentFactory;
    private final TaskContextRepository contextRepository;
    private final ChatSessionRepository sessionRepository;
    private final ChatHistoryService chatHistoryService;
    
    public TaskOrchestrator(AgentFactory agentFactory,
                           TaskContextRepository contextRepository,
                           ChatSessionRepository sessionRepository,
                           ChatHistoryService chatHistoryService) {
        this.agentFactory = agentFactory;
        this.contextRepository = contextRepository;
        this.sessionRepository = sessionRepository;
        this.chatHistoryService = chatHistoryService;
    }
    
    /**
     * Process a message with full stateful context management.
     * Transitions are driven ONLY by agent-suggested next state.
     * Flow:
     * 1. Load/create TaskContext from DB
     * 2. Get current agent
     * 3. Call agent.process() → AgentResult
     * 4. Update context with result
     * 5. Save context to DB
     * 6. Check agent's suggestedNextState (no fallback)
     * 7. If valid suggestion → update state, save, log
     * 8. Return wrapper with context and agent result
     * 
     * @param sessionId Session ID
     * @param message User message to process
     * @return AgentResponseWithResult containing task context and agent result
     */
    public synchronized AgentResponseWithResult processMessage(String sessionId, ChatMessageDTO message) {
        // Step 1: Load or create session and context from DB
        ChatSession session = loadOrCreateSession(sessionId);
        TaskContext context = loadOrCreateContext(session);
        
      /*  // Step 1b: Check if session is paused
        if (session.isPaused()) {
            logger.debug("Session {} is paused, skipping agent call", sessionId);
            return context.withMetadataEntry("lastAgentResponse", "Задача на паузе. Напиши 'продолжить' для возобновления.");
        }
        
        // Step 1c: Detect pause/resume commands
        String content = message.getContent();
        if (content != null) {
            String lowerContent = content.toLowerCase().trim();
            if ("пауза".equals(lowerContent) || "приостанови".equals(lowerContent)) {
                session.setPaused(true);
                sessionRepository.save(session);
                logger.debug("Session {} paused by user", sessionId);
                return context.withMetadataEntry("lastAgentResponse", "Задача приостановлена. Напиши 'продолжить' когда будешь готов.");
            }
            if ("продолжить".equals(lowerContent) || "resume".equals(lowerContent)) {
                session.setPaused(false);
                sessionRepository.save(session);
                logger.debug("Session {} resumed by user", sessionId);
                return context.withMetadataEntry("lastAgentResponse", "Возобновляем работу. Где мы остановились?");
            }
        }
        */
        // Step 2: Get current agent based on session state
        TaskAgent currentAgent = getAgentForState(session.getTaskState());
        
        // Step 3: Process message with agent → AgentResult
        AgentResult result = currentAgent.process(context, message);
        
        // Step 4: Update context with AgentResult
        TaskContext updatedContext = updateContextWithResult(context, result, session.getTaskState());
        
        // Step 5: Save context to DB
        saveContextToDb(session, updatedContext);
        
        // Step 6: Check agent-suggested transition (ONLY mechanism - no fallback)
        Optional<TaskState> nextState = Optional.empty();
        
        // Check for agent-suggested transition
        Optional<TaskState> agentSuggestion = result.getSuggestedNextState();
        if (agentSuggestion.isPresent()) {
            TaskState suggestedState = agentSuggestion.get();
            logger.debug("Agent {} suggested transition to {}", currentAgent.getClass().getSimpleName(), suggestedState);
            
            if (session.getTaskState().isValidTransition(suggestedState)) {
                logger.debug("Transition {} -> {} validated: true", session.getTaskState(), suggestedState);
                nextState = agentSuggestion;
            } else {
                logger.debug("Transition {} -> {} validated: false", session.getTaskState(), suggestedState);
                logger.warn("Agent {} suggested invalid transition to {}, ignoring", currentAgent.getClass().getSimpleName(), suggestedState);
            }
        }
        // No fallback: if agent provides no suggestion or invalid transition, stay in current state
        
        // Step 7: Execute transition if agent suggested valid state
        if (nextState.isPresent()) {
            TaskState targetState = nextState.get();
            logger.debug("Executing transition {} -> {}", session.getTaskState(), targetState);
            
            // Auto-transition PLANNING → EXECUTION: save plan and transition state
            // NOTE: ExecutionAgent will be invoked on the NEXT user message, not immediately
            // This prevents duplicate AI calls in a single request
            if (session.getTaskState() == TaskState.PLANNING && targetState == TaskState.EXECUTION) {
                // 1. Save plan in context
                updatedContext = updatedContext.withPlan(result.getContent());
                
                // 2. Transition to EXECUTION
                transitionToInternal(session, TaskState.EXECUTION, "Plan approved by user");
                updatedContext = updatedContext.withState(TaskState.EXECUTION);
                
                logger.info("Auto-transition PLANNING → EXECUTION completed, will invoke ExecutionAgent on next message");
                
                // Return PlanningAgent's response (plan approval confirmation)
                // Frontend will show this and wait for user's next message to trigger ExecutionAgent
            } else {
                // Standard transition for other states
                transitionToInternal(session, targetState, "Agent-suggested transition");
                updatedContext = updatedContext.withState(targetState);
            }
        }
        
        saveContextToDb(session, updatedContext);
        
        // Step 8: Return wrapper with context and agent result
        return new AgentResponseWithResult(updatedContext, result);
    }
    
    /**
     * Get the current agent for a session.
     * Auto-creates session if not found.
     * 
     * @param sessionId Session ID
     * @return Current agent for the session's state
     */
    public TaskAgent getCurrentAgent(String sessionId) {
        ChatSession session = sessionRepository.findBySessionId(sessionId).orElse(null);
        
        if (session == null) {
            logger.info("Session not found in getCurrentAgent, auto-creating: {}", sessionId);
            String newSessionId = chatHistoryService.createSession();
            session = sessionRepository.findBySessionId(newSessionId)
                .orElseThrow(() -> new IllegalStateException("Failed to create session"));
        }
        
        return getAgentForState(session.getTaskState());
    }
    
    /**
     * Transition session to a new state.
     * 
     * @param sessionId Session ID
     * @param newState Target state
     * @param reason Reason for transition
     */
    public void transitionTo(String sessionId, TaskState newState, String reason) {
        ChatSession session = sessionRepository.findBySessionId(sessionId)
            .orElseThrow(() -> new IllegalArgumentException("Session not found: " + sessionId));
        
        transitionToInternal(session, newState, reason);
    }
    
    /**
     * Get the current context for a session.
     * 
     * @param sessionId Session ID
     * @return Current task context, or null if session not found
     */
    public TaskContext getContext(String sessionId) {
        ChatSession session = sessionRepository.findBySessionId(sessionId).orElse(null);
        
        if (session == null) {
            logger.debug("Session not found in getContext: {}", sessionId);
            return null;
        }
        
        // Load context from DB or create new one if not exists
        return loadOrCreateContext(session);
    }
    
    private TaskContext updateContextWithResult(TaskContext context, AgentResult result, TaskState currentState) {
        TaskContext updated = context;
        
        updated = updated.withMetadataEntry("lastAgentResponse", result.getContent());
        
        if (currentState == TaskState.PLANNING && result.getContent() != null) {
            String cleanPlan = stripTransitionMarkers(result.getContent());
            updated = updated.withPlan(cleanPlan);
        } else if (currentState == TaskState.EXECUTION && result.getContent() != null) {
            String cleanImplementation = stripTransitionMarkers(result.getContent());
            updated = updated.withImplementation(cleanImplementation);
        } else if (currentState == TaskState.VALIDATION) {
            Object validationResult = result.getMetadata().get("validationStatus");
            if (validationResult != null) {
                updated = updated.withMetadataEntry("validationStatus", validationResult.toString());
            }
            // Save validation issues for ExecutionAgent (if revision needed)
            Object validationIssues = result.getMetadata().get("validationIssues");
            if (validationIssues != null && !validationIssues.toString().isBlank()) {
                updated = updated.withMetadataEntry("validationIssues", validationIssues.toString());
            }
        }
        
        for (var entry : result.getMetadata().entrySet()) {
            if (!"lastAgentResponse".equals(entry.getKey())) {
                updated = updated.withMetadataEntry(entry.getKey(), entry.getValue());
            }
        }
        
        if (result.isNeedsRevision()) {
            updated = updated.withNeedsRevision(true);
        }
        
        if (currentState == TaskState.PLANNING) {
            updated = updated.withHistory(new ArrayList<>());
        }
        
        // Clear validation issues after Execution (whether first pass or revision)
        if (currentState == TaskState.EXECUTION) {
            updated = updated.withoutMetadataEntry("validationIssues");
        }
        
        return updated;
    }
    
    /**
     * Load or create a chat session.
     */
    private ChatSession loadOrCreateSession(String sessionId) {
        ChatSession session = sessionRepository.findBySessionId(sessionId).orElse(null);
        
        if (session == null) {
            logger.info("Session not found, auto-creating: {}", sessionId);
            String newSessionId = chatHistoryService.createSession();
            session = sessionRepository.findBySessionId(newSessionId)
                .orElseThrow(() -> new IllegalStateException("Failed to create session"));
            logger.info("Auto-created session {} with PLANNING state", sessionId);
        }
        
        return session;
    }
    
    /**
     * Load or create task context for a session.
     */
    private TaskContext loadOrCreateContext(ChatSession session) {
        List<ChatMessageDTO> recentHistory = chatHistoryService.getLimitedHistoryWithSummary(session.getSessionId(), 10);
        
        Optional<TaskContextEntity> existingContext = contextRepository.findBySessionId(session.getId());
        
        if (existingContext.isPresent()) {
            TaskContext context = TaskContext.fromEntity(existingContext.get());
            return new TaskContext.Builder(context)
                .sessionId(session.getSessionId())
                .currentState(session.getTaskState())
                .withPaused(session.isPaused())
                .withHistory(recentHistory)
                .build();
        }
        
        return TaskContext.builder()
            .sessionId(session.getSessionId())
            .currentState(session.getTaskState())
            .withPaused(session.isPaused())
            .withHistory(recentHistory)
            .build();
    }
    
    /**
     * Get agent for a specific state.
     */
    private TaskAgent getAgentForState(TaskState state) {
        return agentFactory.getAgent(state);
    }
    
    /**
     * Save context to database.
     */
    private void saveContextToDb(ChatSession session, TaskContext context) {
        Optional<TaskContextEntity> existingOpt = contextRepository.findBySessionId(session.getId());
        
        if (existingOpt.isPresent()) {
            TaskContextEntity existingEntity = existingOpt.get();
            TaskContextEntity entity = context.toEntity();
            
            existingEntity.setApprovedPlan(entity.getApprovedPlan());
            existingEntity.setImplementation(entity.getImplementation());
            existingEntity.setValidation(entity.getValidation());
            existingEntity.setNeedsRevision(entity.getNeedsRevision());
            existingEntity.setPaused(entity.isPaused());
            existingEntity.setMetadata(entity.getMetadata());
            existingEntity.setHistory(entity.getHistory());
            existingEntity.setUpdatedAt(Instant.now());
            
            contextRepository.saveAndFlush(existingEntity);
        } else {
            TaskContextEntity entity = context.toEntity();
            entity.setSession(session);
            entity.setCreatedAt(Instant.now());
            entity.setUpdatedAt(Instant.now());
            contextRepository.saveAndFlush(entity);
        }
    }
    
    /**
     * Internal transition logic.
     */
    private void transitionToInternal(ChatSession session, TaskState newState, String reason) {
        TaskState oldState = session.getTaskState();
        
        if (!oldState.isValidTransition(newState)) {
            throw new IllegalStateException(
                String.format("Invalid transition from %s to %s", oldState, newState)
            );
        }
        
        session.setTaskState(newState);
        sessionRepository.save(session);
        
        TaskAgent oldAgent = getAgentForState(oldState);
        TaskAgent newAgent = getAgentForState(newState);
        
        logger.info("Transition: {} → {} | Agent: {} → {} | Session: {} | Reason: {}",
            oldState.getDisplayName(),
            newState.getDisplayName(),
            oldAgent.getClass().getSimpleName(),
            newAgent.getClass().getSimpleName(),
            session.getSessionId(),
            reason
        );
    }
    
    /**
     * Remove transition markers from AI response content.
     */
    private String stripTransitionMarkers(String content) {
        if (content == null || content.isBlank()) {
            return content;
        }
        return content.replaceAll("\\[ПЕРЕХОД К \\w+\\]", "").trim();
    }
}
