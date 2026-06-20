package com.aichat.agent;

import com.aichat.config.AiChatProperties;
import com.aichat.dto.ChatMessageDTO;
import com.aichat.dto.TaskContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;
import java.util.*;

/**
 * Base abstract agent with common AI API call logic.
 */
public abstract class AbstractAgent implements TaskAgent {
    
    protected final AiChatProperties properties;
    protected final WebClient webClient;
    protected final ObjectMapper objectMapper;
    
    protected AbstractAgent(AiChatProperties properties) {
        this.properties = properties;
        this.objectMapper = new ObjectMapper();
        
        HttpClient httpClient = HttpClient.create()
                .responseTimeout(Duration.ofSeconds(120));
        
        this.webClient = WebClient.builder()
                .baseUrl(properties.getProviderBaseUrl())
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(16 * 1024 * 1024))
                .build();
    }
    
    protected String callAiApi(TaskContext context, ChatMessageDTO message) {
        String systemPrompt = getSystemPrompt();
        String userMessage = message.getContent();
        
        Map<String, Object> requestBody = buildRequestBody(systemPrompt, userMessage, context);
        
        String apiKey = properties.getKey();
        String model = properties.getModel();
        
        try {
            Map<String, Object> response = webClient.post()
                    .uri("/chat/completions")
                    .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                    .bodyValue(requestBody)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block(Duration.ofSeconds(120));
            
            if (response != null) {
                List<Map<String, Object>> choices = (List<Map<String, Object>>) response.get("choices");
                if (choices != null && !choices.isEmpty()) {
                    Map<String, String> aiMessage = (Map<String, String>) choices.get(0).get("message");
                    if (aiMessage != null) {
                        return aiMessage.get("content");
                    }
                }
            }
            
            getLogger().warn("Empty response from AI API for agent {}", getClass().getSimpleName());
            return "I received your message but couldn't generate a response.";
            
        } catch (Exception e) {
            getLogger().error("Error calling AI API for agent {}", getClass().getSimpleName(), e);
            return "Error processing your request: " + e.getMessage();
        }
    }
    
    protected Map<String, Object> buildRequestBody(String systemPrompt, String userMessage, TaskContext context) {
        List<Map<String, String>> messages = new ArrayList<>();
        
        Map<String, String> systemMessage = new HashMap<>();
        systemMessage.put("role", "system");
        systemMessage.put("content", systemPrompt);
        messages.add(systemMessage);
        
        addContextMessages(messages, context);
        
        Map<String, String> userMsg = new HashMap<>();
        userMsg.put("role", "user");
        userMsg.put("content", userMessage);
        messages.add(userMsg);
        
        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("model", properties.getModel());
        requestBody.put("messages", messages);
        requestBody.put("stream", false);
        
        if (properties.getTemperature() != null) {
            requestBody.put("temperature", properties.getTemperature());
        }
        if (properties.getMaxTokens() != null) {
            requestBody.put("max_tokens", properties.getMaxTokens());
        }
        
        return requestBody;
    }
    
    protected void addContextMessages(List<Map<String, String>> messages, TaskContext context) {
        // Default: no context messages - subclasses override
    }
    
    protected abstract Logger getLogger();
}
