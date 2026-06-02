package com.aichat.controller;

import com.aichat.dto.ChatRequest;
import com.aichat.dto.ChatResponse;
import com.aichat.service.AiChatService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

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

    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return ResponseEntity.ok("OK");
    }
}
