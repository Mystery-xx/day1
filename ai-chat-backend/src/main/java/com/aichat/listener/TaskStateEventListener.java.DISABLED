package com.aichat.listener;

import com.aichat.agent.TaskAgent;
import com.aichat.dto.AgentResult;
import com.aichat.dto.ChatMessageDTO;
import com.aichat.dto.TaskContext;
import com.aichat.entity.ChatMessage;
import com.aichat.entity.ChatSession;
import com.aichat.enums.TaskState;
import com.aichat.repository.ChatMessageRepository;
import com.aichat.repository.ChatSessionRepository;
import com.aichat.service.AutoTransitionDetector;
import com.aichat.service.StateMachineService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.Optional;

/**
 * Event listener for automatic state transitions on message save.
 * Listens for new chat messages and triggers agent processing + auto-transitions.
 */
@Component
public class TaskStateEventListener {
    
    private static final Logger logger = LoggerFactory.getLogger(TaskStateEventListener.class);
    
    private final StateMachineService stateMachineService;
    private final AutoTransitionDetector transitionDetector;
    private final ChatSessionRepository sessionRepository;
    private final ChatMessageRepository messageRepository;
    
    public TaskStateEventListener(StateMachineService stateMachineService,
                                  AutoTransitionDetector transitionDetector,
                                  ChatSessionRepository sessionRepository,
                                  ChatMessageRepository messageRepository) {
        this.stateMachineService = stateMachineService;
        this.transitionDetector = transitionDetector;
        this.sessionRepository = sessionRepository;
        this.messageRepository = messageRepository;
    }
    
    /**
     * Listen for new chat messages and process with state machine.
     * Runs asynchronously after transaction commit to avoid blocking message save.
     */
    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleNewMessage(ChatMessage message) {
        try {
            // Only process user messages
            if (message.getRole() != ChatMessage.Role.USER) {
                return;
            }
            
            String sessionId = message.getSessionId();
            
            // Get session
            ChatSession session = sessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("Session not found: " + sessionId));
            
            TaskAgent currentAgent = stateMachineService.getCurrentAgent(sessionId);
            ChatMessageDTO messageDTO = convertToDTO(message);
            TaskContext context = TaskContext.builder()
                .sessionId(sessionId)
                .currentState(session.getTaskState())
                .build();
            
            AgentResult result = currentAgent.process(context, messageDTO);
            TaskContext processedContext = updateContextWithResult(context, result);
            
            Optional<TaskState> nextState = transitionDetector.detect(processedContext, messageDTO);
            
            if (nextState.isPresent()) {
                TaskState targetState = nextState.get();
                if (session.getTaskState().isValidTransition(targetState)) {
                    stateMachineService.transitionTo(sessionId, targetState, 
                        "Auto-transition detected from user message");
                }
            }
        } catch (Exception e) {
            // Log error but don't break message save
            logger.error("Error processing state machine event for message {}: {}", 
                message.getId(), e.getMessage(), e);
        }
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
    
    private ChatMessageDTO convertToDTO(ChatMessage entity) {
        ChatMessageDTO dto = new ChatMessageDTO();
        dto.setId(entity.getId());
        dto.setSessionId(entity.getSessionId());
        dto.setRole(entity.getRole().name().toLowerCase());
        dto.setContent(entity.getContent());
        dto.setModel(entity.getModel());
        dto.setPromptTokens(entity.getPromptTokens());
        dto.setCompletionTokens(entity.getCompletionTokens());
        dto.setTotalTokens(entity.getTotalTokens());
        dto.setResponseTimeMs(entity.getResponseTimeMs());
        dto.setProvider(entity.getProvider());
        dto.setTemperature(entity.getTemperature());
        dto.setMaxTokens(entity.getMaxTokens());
        dto.setCreatedAt(entity.getCreatedAt());
        dto.setSummary(entity.getSummary());
        return dto;
    }
}
