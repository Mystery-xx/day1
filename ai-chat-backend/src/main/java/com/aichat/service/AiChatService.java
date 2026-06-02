package com.aichat.service;

import com.aichat.config.AiChatProperties;
import com.aichat.dto.ChatRequest;
import com.aichat.dto.ChatResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class AiChatService {

    private static final Logger logger = LoggerFactory.getLogger(AiChatService.class);

    private final WebClient webClient;
    private final AiChatProperties properties;

    public AiChatService(AiChatProperties properties) {
        this.properties = properties;
        this.webClient = WebClient.builder()
                .baseUrl(properties.getUrl())
                .build();
    }

    public Mono<ChatResponse> sendMessage(ChatRequest request) {
        logger.debug("Sending message to AI: {}", request.getMessage());

        List<Map<String, String>> messages = new ArrayList<>();

        if (request.getHistory() != null) {
            for (ChatRequest.Message msg : request.getHistory()) {
                Map<String, String> message = new HashMap<>();
                message.put("role", msg.getRole());
                message.put("content", msg.getContent());
                messages.add(message);
            }
        }

        Map<String, String> userMessage = new HashMap<>();
        userMessage.put("role", "user");
        userMessage.put("content", request.getMessage());
        messages.add(userMessage);

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("model", properties.getModel());
        requestBody.put("messages", messages);
        requestBody.put("stream", false);

        return webClient.post()
                .uri("/chat/completions")
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + properties.getKey())
                .bodyValue(requestBody)
                .retrieve()
                .bodyToMono(Map.class)
                .map(response -> {
                    logger.debug("Received response from AI: {}", response);
                    try {
                        List<Map<String, Object>> choices = (List<Map<String, Object>>) response.get("choices");
                        if (choices != null && !choices.isEmpty()) {
                            Map<String, Object> firstChoice = choices.get(0);
                            Map<String, String> message = (Map<String, String>) firstChoice.get("message");
                            if (message != null) {
                                return ChatResponse.success(message.get("content"));
                            }
                        }
                        return ChatResponse.error("Empty response from AI");
                    } catch (Exception e) {
                        logger.error("Error parsing AI response", e);
                        return ChatResponse.error("Error parsing response: " + e.getMessage());
                    }
                })
                .onErrorResume(e -> {
                    logger.error("Error calling AI API", e);
                    return Mono.just(ChatResponse.error("Error calling AI: " + e.getMessage()));
                });
    }
}
