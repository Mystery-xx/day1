package com.aichat.controller;

import com.aichat.dto.ChatRequest;
import com.aichat.dto.ChatResponse;
import com.aichat.service.AiChatService;
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
import java.util.Map;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

@RestController
@RequestMapping("/api/chat")
@CrossOrigin(originPatterns = "*", allowCredentials = "true")
public class ChatController {

    private static final Logger logger = LoggerFactory.getLogger(ChatController.class);

    private final AiChatService chatService;

    public ChatController(AiChatService chatService) {
        this.chatService = chatService;
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
        
        ObjectMapper mapper = new ObjectMapper();
        
        return Flux.create(emitter -> {
            try {
                // Immediately emit debugRequest
                Map<String, Object> debugRequest = chatService.buildDebugRequest(request);
                logger.debug("Emitting debug request immediately: {}", debugRequest);
                String debugRequestJson = mapper.writeValueAsString(Map.of("type", "debugRequest", "data", debugRequest));
                emitter.next("data:" + debugRequestJson + "\n\n");
                
                // Then call AI API and emit response when ready
                chatService.sendMessage(request)
                    .subscribe(
                        response -> {
                            try {
                                logger.debug("Emitting response: {}", response);
                                String responseJson = mapper.writeValueAsString(Map.of("type", "response", "data", response));
                                emitter.next("data:" + responseJson + "\n\n");
                                emitter.complete();
                            } catch (JsonProcessingException e) {
                                emitter.error(e);
                            }
                        },
                        error -> {
                            try {
                                logger.error("Error in streaming call", error);
                                String errorJson = mapper.writeValueAsString(Map.of("type", "error", "data", Map.of("error", error.getMessage())));
                                emitter.next("data:" + errorJson + "\n\n");
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

    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return ResponseEntity.ok("OK");
    }
}
