package com.aichat.controller;

import com.aichat.dto.ChatRequest;
import com.aichat.dto.ChatResponse;
import com.aichat.dto.ModelInfo;
import com.aichat.dto.ChatMessageDTO;
import com.aichat.dto.SessionInfoDTO;
import com.aichat.dto.SessionCreateResponse;
import com.aichat.dto.StickyFactDTO;
import com.aichat.dto.TaskStateDTO;
import com.aichat.dto.TaskContext;
import com.aichat.dto.AgentResponseWithResult;
import com.aichat.service.AiChatService;
import com.aichat.service.ChatHistoryService;
import com.aichat.service.StickyFactService;
import com.aichat.service.FactExtractionService;
import com.aichat.service.TaskOrchestrator;
import com.aichat.agent.TaskAgent;
import com.aichat.enums.TaskState;
import com.aichat.entity.ChatSession;
import com.aichat.repository.ChatSessionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;
import reactor.core.publisher.Flux;
import reactor.core.scheduler.Schedulers;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Duration;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

@RestController
@RequestMapping("/api/chat")
@CrossOrigin(originPatterns = "*", allowCredentials = "true")
public class ChatController {

    private static final Logger logger = LoggerFactory.getLogger(ChatController.class);

    private final AiChatService chatService;
    private final ChatHistoryService historyService;
    private final StickyFactService stickyFactService;
    private final FactExtractionService factExtractionService;
    private final TaskOrchestrator orchestrator;
    private final ChatSessionRepository sessionRepository;

    public ChatController(AiChatService chatService, ChatHistoryService historyService,
                          StickyFactService stickyFactService, FactExtractionService factExtractionService,
                          TaskOrchestrator orchestrator, ChatSessionRepository sessionRepository) {
        this.chatService = chatService;
        this.historyService = historyService;
        this.stickyFactService = stickyFactService;
        this.factExtractionService = factExtractionService;
        this.orchestrator = orchestrator;
        this.sessionRepository = sessionRepository;
    }

    @PostMapping
    public Mono<ResponseEntity<ChatResponse>> sendMessage(@RequestBody ChatRequest request) {
        logger.info("Received chat request");
        return chatService.sendMessage(request)
                .map(response -> {
                    if (response.getError() != null) {
                        return ResponseEntity.internalServerError().body(response);
                    }
                    return ResponseEntity.ok(response);
                });
    }

    @PostMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<String> sendMessageStream(@RequestBody ChatRequest request) {
        logger.info("Received streaming chat request");
        
        // Generate sessionId if not provided
        String sessionId = request.getSessionId();
        if (sessionId == null || sessionId.isEmpty()) {
            sessionId = historyService.createSession();
            request.setSessionId(sessionId);
        }
        
        final String finalSessionId = sessionId;
        
        try {
            historyService.getSessionHistory(sessionId);
        } catch (IllegalArgumentException e) {
            logger.info("Session not found, auto-creating: {}", sessionId);
            historyService.createSession();
        }
        
        ObjectMapper mapper = new ObjectMapper();
        
        return Flux.create(emitter -> {
            TaskAgent currentAgent = null;
            String agentSystemPrompt = null;
            String agentResponseContent = null;
            
            // Save user message FIRST before calling AI (so it's preserved even if AI fails)
            long startTime = System.currentTimeMillis();
            final String sessionIdForSave = finalSessionId;
            try {
                historyService.saveMessage(
                    sessionIdForSave,
                    "user",
                    request.getMessage(),
                    null, null, null, null,
                    null,
                    request.getSettings() != null ? request.getSettings().getProvider() : null,
                    request.getSettings() != null ? request.getSettings().getTemperature() : null,
                    request.getSettings() != null ? request.getSettings().getMaxTokens() : null
                );
            } catch (Exception saveEx) {
                logger.error("Failed to save user message: {}", saveEx.getMessage());
            }
            
            try {
                ChatMessageDTO userMessage = new ChatMessageDTO("user", request.getMessage());
                AgentResponseWithResult responseWithResult = orchestrator.processMessage(finalSessionId, userMessage);
                
                agentResponseContent = responseWithResult.getContent();
                
                // Get system prompt AFTER processMessage - this ensures we get the correct agent's prompt
                // (e.g., after auto-transition PLANNING→EXECUTION, we get ExecutionAgent's prompt, not PlanningAgent's)
                currentAgent = orchestrator.getCurrentAgent(finalSessionId);
                agentSystemPrompt = currentAgent.getSystemPrompt();
                
                TaskState currentState = responseWithResult.getTaskContext().getCurrentState();
                
                logger.info("State Machine: Agent={}, State={}, SystemPromptLength={}, AgentResponseLength={}",
                    currentAgent.getClass().getSimpleName(),
                    currentState.getDisplayName(),
                    agentSystemPrompt != null ? agentSystemPrompt.length() : 0,
                    agentResponseContent != null ? agentResponseContent.length() : 0);
                
                // Emit task state update immediately after processing (in case of transition)
                String stateUpdateJson = mapper.writeValueAsString(Map.of(
                    "type", "taskState",
                    "data", Map.of(
                        "state", currentState.name(),
                        "displayName", currentState.getDisplayName(),
                        "order", currentState.getOrder(),
                        "agentClass", currentState.getAgentClass()
                    ),
                    "sessionId", finalSessionId
                ));
                emitter.next(stateUpdateJson);
            } catch (Exception smEx) {
                logger.warn("State Machine processing failed: {}", smEx.getMessage());
                // Fallback: try to get system prompt from current agent even after failure
                if (agentSystemPrompt == null) {
                    try {
                        TaskAgent fallbackAgent = orchestrator.getCurrentAgent(finalSessionId);
                        if (fallbackAgent != null) {
                            agentSystemPrompt = fallbackAgent.getSystemPrompt();
                            logger.info("Fallback: got system prompt from agent: {}",
                                fallbackAgent.getClass().getSimpleName());
                        }
                    } catch (Exception fallbackEx) {
                        logger.warn("Could not get fallback system prompt: {}", fallbackEx.getMessage());
                    }
                }
            }
            
            // Handle orchestrator response
            if (agentResponseContent != null) {
                // Strip transition markers from displayed content
                String displayContent = stripTransitionMarkers(agentResponseContent);
                logger.debug("Agent response: raw_length={}, display_length={}", agentResponseContent.length(), displayContent.length());
                
                ChatResponse agentResponse = new ChatResponse();
                agentResponse.setContent(displayContent);
                agentResponse.setModel(request.getSettings() != null ? request.getSettings().getModel() : null);
                agentResponse.setUsage(Map.of("prompt_tokens", 0, "completion_tokens", 0, "total_tokens", 0));
                
                logger.debug("Using agent's response directly (no second AI call)");
                
                try {
                    
                    Integer responseTime = (int) (System.currentTimeMillis() - startTime);
                    historyService.saveMessage(
                        sessionIdForSave,
                        "assistant",
                        agentResponse.getContent(),
                        agentResponse.getModel(),
                        0, 0, 0,
                        responseTime,
                        request.getSettings() != null ? request.getSettings().getProvider() : null,
                        request.getSettings() != null ? request.getSettings().getTemperature() : null,
                        request.getSettings() != null ? request.getSettings().getMaxTokens() : null
                    );
                    
                    int[] sessionTotals = historyService.getSessionTokenUsage(sessionIdForSave);
                    agentResponse.setSessionTotalPromptTokens(sessionTotals[0]);
                    agentResponse.setSessionTotalCompletionTokens(sessionTotals[1]);
                    agentResponse.setSessionTotalTokens(sessionTotals[2]);
                    
                    String provider = request.getSettings() != null ? request.getSettings().getProvider() : null;
                    String model = request.getSettings() != null ? request.getSettings().getModel() : null;
                    String strategy = request.getSettings() != null ? request.getSettings().getContextStrategy() : null;
                    boolean shouldGenerateSummary = !"stickyFacts".equalsIgnoreCase(strategy);
                    var summaryResult = shouldGenerateSummary ? chatService.generateSummaryIfNeeded(sessionIdForSave, provider, model) : null;
                    if (summaryResult != null) {
                        agentResponse.setDebugSummaryRequest(summaryResult.getRequest());
                        agentResponse.setDebugSummaryResponse(summaryResult.getResponse());
                    }
                    
                    List<StickyFactDTO> responseStickyFacts = stickyFactService.getFacts(sessionIdForSave);
                    Map<String, Object> stickyFactsDebug = new HashMap<>();
                    stickyFactsDebug.put("stickyFacts", responseStickyFacts != null ? responseStickyFacts : List.of());
                    agentResponse.setDebugStickyFacts(stickyFactsDebug);
                    agentResponse.setStickyFactsUpdated(true);
                    
                    String responseJson = mapper.writeValueAsString(Map.of(
                        "type", "response", 
                        "data", agentResponse,
                        "sessionId", sessionIdForSave
                    ));
                    emitter.next(responseJson);
                    emitter.complete();
                } catch (JsonProcessingException e) {
                    emitter.error(e);
                }
            } else {
                // Orchestrator failed and returned null content - do NOT make a second AI call
                // This prevents duplicate API calls when the orchestrator already attempted one
                logger.error("Orchestrator processMessage returned null content - skipping fallback to prevent duplicate AI call. Session: {}", finalSessionId);
                
                // Emit error message to user instead of making second AI call
                ChatResponse errorResponse = new ChatResponse();
                errorResponse.setContent("Sorry, I encountered an error processing your request. Please try again.");
                errorResponse.setModel(request.getSettings() != null ? request.getSettings().getModel() : null);
                errorResponse.setUsage(Map.of("prompt_tokens", 0, "completion_tokens", 0, "total_tokens", 0));
                errorResponse.setError("Orchestrator processing failed - see backend logs for details");
                
                try {
                    String errorJson = mapper.writeValueAsString(Map.of(
                        "type", "response",
                        "data", errorResponse,
                        "sessionId", finalSessionId
                    ));
                    emitter.next(errorJson);
                    emitter.complete();
                } catch (JsonProcessingException e) {
                    emitter.error(e);
                }
            }
        });
    }

    @GetMapping("/history/{sessionId}")
    public ResponseEntity<List<ChatMessageDTO>> getSessionHistory(@PathVariable String sessionId) {
        logger.info("Fetching history for session: {}", sessionId);
        List<ChatMessageDTO> history = historyService.getSessionHistory(sessionId);
        return ResponseEntity.ok(history);
    }

    @DeleteMapping("/history/{sessionId}")
    public ResponseEntity<Void> deleteSession(@PathVariable String sessionId) {
        logger.info("Deleting session: {}", sessionId);
        historyService.deleteSession(sessionId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/history/session")
    public ResponseEntity<SessionCreateResponse> createSession() {
        String sessionId = historyService.createSession();
        return ResponseEntity.ok(new SessionCreateResponse(sessionId));
    }

    @GetMapping("/sessions")
    public ResponseEntity<List<SessionInfoDTO>> getAllSessions(
            @RequestParam(defaultValue = "10") int limit,
            @RequestParam(defaultValue = "0") int offset) {
        logger.info("Fetching sessions: limit={}, offset={}", limit, offset);
        List<SessionInfoDTO> sessions = historyService.getAllSessions(limit, offset);
        return ResponseEntity.ok(sessions);
    }

    @DeleteMapping("/sessions")
    public ResponseEntity<Void> deleteAllSessions() {
        logger.info("Deleting all sessions");
        historyService.deleteAllSessions();
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return ResponseEntity.ok("OK");
    }
    
    @GetMapping("/models")
    public Mono<ResponseEntity<List<ModelInfo>>> getModels(@RequestParam(required = false, defaultValue = "gpustack") String provider) {
        logger.info("Fetching models for provider: {}", provider);
        return chatService.fetchModels(provider)
                .map(models -> {
                    if (models.isEmpty()) {
                        return ResponseEntity.ok(Collections.emptyList());
                    }
                    return ResponseEntity.ok(models);
                });
    }
    
    @PostMapping("/sessions/{sessionId}/duplicate")
    public ResponseEntity<List<String>> duplicateSession(
            @PathVariable String sessionId,
            @RequestParam(defaultValue = "3") int count) {
        logger.info("Duplicating session: {} {} times", sessionId, count);
        
        List<String> newSessionIds = new java.util.ArrayList<>();
        for (int i = 0; i < count; i++) {
            String newSessionId = historyService.duplicateSession(sessionId);
            if (newSessionId != null) {
                newSessionIds.add(newSessionId);
                logger.info("Created duplicate session #{}: {}", i + 1, newSessionId);
            } else {
                logger.warn("Failed to duplicate session {} (copy #{})", sessionId, i + 1);
            }
        }
        
        if (newSessionIds.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        
        return ResponseEntity.ok(newSessionIds);
    }
    
    @PostMapping("/sessions/{sessionId}/branch")
    public ResponseEntity<String> createBranch(
            @PathVariable String sessionId,
            @RequestParam int messageIndex) {
        logger.info("Creating branch from session: {} up to message index: {}", sessionId, messageIndex);
        
        String newSessionId = historyService.duplicateSessionUpToIndex(sessionId, messageIndex);
        
        if (newSessionId == null) {
            logger.warn("Failed to create branch from session {} at index {}", sessionId, messageIndex);
            return ResponseEntity.notFound().build();
        }
        
        logger.info("Created branch session: {}", newSessionId);
        return ResponseEntity.ok(newSessionId);
    }
    
    @DeleteMapping("/sessions/{sessionId}/summary")
    public ResponseEntity<Void> deleteSessionSummary(@PathVariable String sessionId) {
        logger.info("Deleting summary for session: {}", sessionId);
        historyService.deleteSessionSummary(sessionId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/sessions/{sessionId}/sticky-facts")
    public ResponseEntity<List<StickyFactDTO>> getStickyFacts(@PathVariable String sessionId) {
        logger.info("Fetching sticky facts for session: {}", sessionId);
        return ResponseEntity.ok(stickyFactService.getFacts(sessionId));
    }

    @PostMapping("/sessions/{sessionId}/sticky-facts")
    public ResponseEntity<StickyFactDTO> saveStickyFact(
            @PathVariable String sessionId,
            @RequestBody Map<String, String> body) {
        String factKey = body.get("factKey");
        String factValue = body.get("factValue");
        if (factKey == null || factKey.isBlank() || factValue == null) {
            return ResponseEntity.badRequest().build();
        }
        logger.info("Saving sticky fact for session {}: key={}", sessionId, factKey);
        return ResponseEntity.ok(stickyFactService.saveFact(sessionId, factKey.trim(), factValue.trim()));
    }

    @DeleteMapping("/sessions/{sessionId}/sticky-facts/{factKey}")
    public ResponseEntity<Void> deleteStickyFact(
            @PathVariable String sessionId,
            @PathVariable String factKey) {
        logger.info("Deleting sticky fact for session {}: key={}", sessionId, factKey);
        stickyFactService.deleteFact(sessionId, factKey);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/sessions/{sessionId}/sticky-facts")
    public ResponseEntity<Void> deleteAllStickyFacts(@PathVariable String sessionId) {
        logger.info("Deleting all sticky facts for session: {}", sessionId);
        stickyFactService.deleteFactsBySession(sessionId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/sessions/{sessionId}/extract-facts")
    public ResponseEntity<Map<String, String>> extractFacts(
            @PathVariable String sessionId,
            @RequestBody(required = false) Map<String, Object> options) {
        logger.info("Manually triggering fact extraction for session: {}", sessionId);
        
        String model = options != null && options.get("model") != null 
            ? (String) options.get("model") 
            : null;
        String provider = options != null && options.get("provider") != null 
            ? (String) options.get("provider") 
            : null;
        
        Map<String, String> extractedFacts = factExtractionService.extractAndSaveFacts(sessionId, model, provider);
        return ResponseEntity.ok(extractedFacts);
    }

    @GetMapping("/sessions/{sessionId}/state")
    public ResponseEntity<TaskStateDTO> getSessionState(@PathVariable String sessionId) {
        logger.info("Fetching state for session: {}", sessionId);
        try {
            TaskContext context = orchestrator.getContext(sessionId);
            if (context == null || context.getCurrentState() == null) {
                logger.warn("Session context or state not found: {}", sessionId);
                TaskState defaultState = TaskState.PLANNING;
                TaskStateDTO stateDTO = new TaskStateDTO(
                    defaultState.name(),
                    defaultState.getDisplayName(),
                    defaultState.getOrder(),
                    defaultState.getAgentClass(),
                    false
                );
                return ResponseEntity.ok(stateDTO);
            }
            logger.info("Current state: {}", context.getCurrentState().getDisplayName());
            TaskState taskState = context.getCurrentState();
            TaskStateDTO stateDTO = new TaskStateDTO(
                taskState.name(),
                taskState.getDisplayName(),
                taskState.getOrder(),
                taskState.getAgentClass(),
                context.isPaused()
            );
            return ResponseEntity.ok(stateDTO);
        } catch (IllegalArgumentException e) {
            logger.warn("Session not found: {}", sessionId);
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping("/sessions/{sessionId}/pause")
    public ResponseEntity<Void> pauseSession(@PathVariable String sessionId) {
        logger.info("Pausing session: {}", sessionId);
        try {
            ChatSession session = sessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("Session not found: " + sessionId));
            session.setPaused(true);
            sessionRepository.save(session);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            logger.warn("Session not found: {}", sessionId);
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping("/sessions/{sessionId}/resume")
    public ResponseEntity<Void> resumeSession(@PathVariable String sessionId) {
        logger.info("Resuming session: {}", sessionId);
        try {
            ChatSession session = sessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new IllegalArgumentException("Session not found: " + sessionId));
            session.setPaused(false);
            sessionRepository.save(session);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            logger.warn("Session not found: {}", sessionId);
            return ResponseEntity.notFound().build();
        }
    }
    
    /**
     * Strip internal transition markers from agent response before displaying to user.
     * These markers are used for state machine transitions but should not be visible.
     */
    private String stripTransitionMarkers(String content) {
        if (content == null) {
            return null;
        }
        return content
            .replaceAll("\\[ПЕРЕХОД К EXECUTION\\]", "")
            .replaceAll("\\[TRANSITION TO EXECUTION\\]", "")
            .replaceAll("\\[ПЕРЕХОД К PLANNING\\]", "")
            .replaceAll("\\[TRANSITION TO PLANNING\\]", "")
            .replaceAll("\\[ПЕРЕХОД К VALIDATION\\]", "")
            .replaceAll("\\[TRANSITION TO VALIDATION\\]", "")
            .replaceAll("\\[ПЕРЕХОД К DONE\\]", "")
            .replaceAll("\\[TRANSITION TO DONE\\]", "")
            .trim();
    }
}
