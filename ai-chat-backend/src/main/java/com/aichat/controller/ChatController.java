package com.aichat.controller;

import com.aichat.dto.ChatRequest;
import com.aichat.dto.ChatResponse;
import com.aichat.dto.ModelInfo;
import com.aichat.dto.ChatMessageDTO;
import com.aichat.dto.SessionInfoDTO;
import com.aichat.dto.SessionCreateResponse;
import com.aichat.service.AiChatService;
import com.aichat.service.ChatHistoryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;
import reactor.core.publisher.Flux;
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

    public ChatController(AiChatService chatService, ChatHistoryService historyService) {
        this.chatService = chatService;
        this.historyService = historyService;
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
        }
        
        final String finalSessionId = sessionId;
        
        ObjectMapper mapper = new ObjectMapper();
        
        return Flux.create(emitter -> {
            try {
                // Immediately emit debugRequest + sessionId
                Map<String, Object> debugRequest = chatService.buildDebugRequest(request);
                logger.debug("Emitting debug request immediately: {}", debugRequest);
                String debugRequestJson = mapper.writeValueAsString(Map.of(
                    "type", "debugRequest", 
                    "data", debugRequest,
                    "sessionId", finalSessionId
                ));
                emitter.next(debugRequestJson);
                
                // Track start time
                long startTime = System.currentTimeMillis();
                final String sessionIdForSave = finalSessionId;
                
                // Then call AI API and emit response when ready
                chatService.sendMessage(request)
                    .subscribe(
                        response -> {
                            try {
                                logger.debug("Emitting response: {}", response);
                                
                                // Save user message to DB
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
                                
                                // Save assistant response to DB if successful
                                if (response.getContent() != null && response.getError() == null) {
                                    Integer responseTime = (int) (System.currentTimeMillis() - startTime);
                                    Integer promptTokens = response.getUsage() != null ? 
                                        (Integer) response.getUsage().get("prompt_tokens") : null;
                                    Integer completionTokens = response.getUsage() != null ? 
                                        (Integer) response.getUsage().get("completion_tokens") : null;
                                    Integer totalTokens = response.getUsage() != null ? 
                                        (Integer) response.getUsage().get("total_tokens") : null;
                                    
                                    historyService.saveMessage(
                                        sessionIdForSave,
                                        "assistant",
                                        response.getContent(),
                                        response.getModel(),
                                        promptTokens,
                                        completionTokens,
                                        totalTokens,
                                        responseTime,
                                        request.getSettings() != null ? request.getSettings().getProvider() : null,
                                        request.getSettings() != null ? request.getSettings().getTemperature() : null,
                                        request.getSettings() != null ? request.getSettings().getMaxTokens() : null
                                    );
                                    
                                    // Calculate session totals
                                    int[] sessionTotals = historyService.getSessionTokenUsage(sessionIdForSave);
                                    response.setSessionTotalPromptTokens(sessionTotals[0]);
                                    response.setSessionTotalCompletionTokens(sessionTotals[1]);
                                    response.setSessionTotalTokens(sessionTotals[2]);
                                    
                                    // Generate summary if needed and capture debug info
                                    String provider = request.getSettings() != null ? request.getSettings().getProvider() : null;
                                    String model = request.getSettings() != null ? request.getSettings().getModel() : null;
                                    var summaryResult = chatService.generateSummaryIfNeeded(sessionIdForSave, provider, model);
                                    if (summaryResult != null) {
                                        response.setDebugSummaryRequest(summaryResult.getRequest());
                                        response.setDebugSummaryResponse(summaryResult.getResponse());
                                    }
                                }
                                
                                // Send full ChatResponse with debug fields + sessionId
                                String responseJson = mapper.writeValueAsString(Map.of(
                                    "type", "response", 
                                    "data", response,
                                    "sessionId", sessionIdForSave
                                ));
                                emitter.next(responseJson);
                                emitter.complete();
                            } catch (JsonProcessingException e) {
                                emitter.error(e);
                            }
                        },
                        error -> {
                            try {
                                logger.error("Error in streaming call", error);
                                String errorJson = mapper.writeValueAsString(Map.of(
                                    "type", "error", 
                                    "data", Map.of("error", error.getMessage()),
                                    "sessionId", sessionIdForSave
                                ));
                                emitter.next(errorJson);
                                emitter.complete();
                            } catch (JsonProcessingException ex) {
                                emitter.error(ex);
                            }
                        }
                    );
            } catch (JsonProcessingException e) {
                emitter.error(e);
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
    
    @DeleteMapping("/sessions/{sessionId}/summary")
    public ResponseEntity<Void> deleteSessionSummary(@PathVariable String sessionId) {
        logger.info("Deleting summary for session: {}", sessionId);
        historyService.deleteSessionSummary(sessionId);
        return ResponseEntity.noContent().build();
    }
}
