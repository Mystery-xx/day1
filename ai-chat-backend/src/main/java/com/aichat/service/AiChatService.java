package com.aichat.service;

import com.aichat.config.AiChatProperties;
import com.aichat.dto.ChatRequest;
import com.aichat.dto.ChatResponse;
import com.aichat.dto.ModelInfo;
import com.aichat.dto.ChatMessageDTO;
import com.aichat.dto.SummaryResult;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Collections;

@Service
public class AiChatService {

    private static final Logger logger = LoggerFactory.getLogger(AiChatService.class);

    private final WebClient webClient;
    private final AiChatProperties properties;
    private final ObjectMapper objectMapper;
    private final ChatHistoryService historyService;

    public AiChatService(AiChatProperties properties, ChatHistoryService historyService) {
        this.properties = properties;
        this.objectMapper = new ObjectMapper();
        this.historyService = historyService;
        
        HttpClient httpClient = HttpClient.create()
                .responseTimeout(Duration.ofSeconds(120));
        
        this.webClient = WebClient.builder()
                .baseUrl(properties.getProviderBaseUrl())
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(16 * 1024 * 1024))
                .build();
    }

    public Mono<ChatResponse> sendMessage(ChatRequest request) {
        logger.debug("Sending message to AI: {}", request.getMessage());

        Map<String, Object> requestBody = buildRequestBody(request);

        logger.debug("AI API Request body: {}", requestBody);
        
        String provider = request.getSettings() != null ? request.getSettings().getProvider() : properties.getProvider();
        String baseUrl = getBaseUrlForProvider(provider);
        String apiKey = getApiKeyForProvider(provider);
        
        logger.info("SEND MESSAGE - Provider: {}, Base URL: {}, API Key: {}", provider, baseUrl, maskApiKey(apiKey));
        logger.info("Request body: {}", requestBody);

        WebClient requestWebClient = WebClient.builder()
                .baseUrl(baseUrl)
                .clientConnector(new ReactorClientHttpConnector(HttpClient.create()))
                .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(16 * 1024 * 1024))
                .build();

        return requestWebClient.post()
                .uri("/chat/completions")
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                .bodyValue(requestBody)
                .retrieve()
                .bodyToMono(Map.class)
                .map(response -> {
                    logger.debug("Received response from AI: {}", response);
                    try {
                        List<Map<String, Object>> choices = (List<Map<String, Object>>) response.get("choices");
                        if (choices != null && !choices.isEmpty()) {
                            Map<String, String> message = (Map<String, String>) choices.get(0).get("message");
                            if (message != null) {
                                String content = message.get("content");
                                String model = (String) response.get("model");
                                Map<String, Object> usage = (Map<String, Object>) response.get("usage");
                                ChatResponse chatResponse = new ChatResponse(content, null, model, usage);
                                chatResponse.setDebugRequest(requestBody);
                                chatResponse.setDebugResponse(response);
                                return chatResponse;
                            }
                        }
                        ChatResponse errorResponse = ChatResponse.error("Empty response from AI");
                        errorResponse.setDebugRequest(requestBody);
                        errorResponse.setDebugResponse(response);
                        return errorResponse;
                    } catch (Exception e) {
                        logger.error("Error parsing AI response", e);
                        ChatResponse errorResponse = ChatResponse.error("Error parsing response: " + e.getMessage());
                        errorResponse.setDebugRequest(requestBody);
                        errorResponse.setDebugResponse(response);
                        return errorResponse;
                    }
                })
                .onErrorResume(e -> {
                    if (e instanceof WebClientResponseException) {
                        WebClientResponseException wcre = (WebClientResponseException) e;
                        logger.error("HTTP {} - Response body: {}", wcre.getStatusCode(), wcre.getResponseBodyAsString());
                    } else {
                        logger.error("Error calling AI API", e);
                    }
                    ChatResponse errorResponse = ChatResponse.error("Error calling AI: " + e.getMessage());
                    errorResponse.setDebugRequest(requestBody);
                    errorResponse.setDebugResponse(Map.of("error", e.getMessage()));
                    return Mono.just(errorResponse);
                });
    }

    public Map<String, Object> buildDebugRequest(ChatRequest request) {
        return buildRequestBody(request);
    }

    public Mono<List<ModelInfo>> fetchModels(String provider) {
        String baseUrl = getBaseUrlForProvider(provider);
        String apiKey = getApiKeyForProvider(provider);
        
        logger.debug("Fetching models from provider: {}, baseUrl: {}, apiKey: {}", provider, baseUrl, maskApiKey(apiKey));
        
        WebClient modelsClient = WebClient.builder()
                .baseUrl(baseUrl)
                .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(16 * 1024 * 1024))
                .build();
        
        return modelsClient.get()
                .uri("/models")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                .retrieve()
                .bodyToMono(Map.class)
                .flatMap(response -> {
                    try {
                        List<ModelInfo> models = new ArrayList<>();
                        Object dataObj = response.get("data");
                        if (dataObj instanceof List) {
                            List<?> dataList = (List<?>) dataObj;
                            for (Object item : dataList) {
                                if (item instanceof Map) {
                                    Map<String, Object> modelData = (Map<String, Object>) item;
                                    ModelInfo model = new ModelInfo();
                                    model.setId((String) modelData.get("id"));
                                    model.setObject((String) modelData.get("object"));
                                    Object created = modelData.get("created");
                                    if (created instanceof Number) {
                                        model.setCreated(((Number) created).longValue());
                                    }
                                    model.setOwnedBy((String) modelData.get("owned_by"));
                                    model.setCategory(categorizeModel(model.getId()));
                                    models.add(model);
                                }
                            }
                        }
                        logger.debug("Found {} models from {}", models.size(), provider);
                        return Mono.just(models);
                    } catch (Exception e) {
                        logger.error("Error parsing models response from {}", provider, e);
                        return Mono.just(Collections.<ModelInfo>emptyList());
                    }
                })
                .onErrorResume(e -> {
                    logger.error("Error fetching models from {}", provider, e);
                    return Mono.just(Collections.<ModelInfo>emptyList());
                });
    }
    
    private String getBaseUrlForProvider(String provider) {
        if ("huggingface".equalsIgnoreCase(provider)) {
            return properties.getHuggingfaceUrl() != null ? properties.getHuggingfaceUrl() : properties.getUrl();
        } else {
            return properties.getGpustackUrl() != null ? properties.getGpustackUrl() : properties.getUrl();
        }
    }
    
    private String getApiKeyForProvider(String provider) {
        if ("huggingface".equalsIgnoreCase(provider)) {
            String hfToken = properties.getHuggingfaceToken();
            return hfToken != null && !hfToken.isEmpty() ? hfToken : properties.getKey();
        } else {
            return properties.getKey();
        }
    }
    
    private String maskApiKey(String apiKey) {
        if (apiKey == null || apiKey.length() <= 8) {
            return "***";
        }
        return apiKey.substring(0, 4) + "..." + apiKey.substring(apiKey.length() - 4);
    }

    /**
     * Categorize models by capability based on model name patterns.
     * Categories: "weak" (small/fast), "medium" (balanced), "strong" (large/capable), "super" (300B+)
     */
    private String categorizeModel(String modelId) {
        if (modelId == null) {
            return "medium";
        }
        
        String id = modelId.toLowerCase();
        
        // Super strong models - 300B+ parameters, maximum capability
        if (id.contains("397b") || id.contains("qwen3.5-397b") ||
            id.contains("235b") || id.contains("qwen3-235b")) {
            return "super";
        }
        
        // Strong models - 70B-100B parameters, high capability
        if (id.contains("qwen2.5-72b") || id.contains("qwen2.5-70b") || 
            id.contains("72b") || id.contains("70b") ||
            id.contains("llama-3-70b") || id.contains("llama-3.1-70b") ||
            id.contains("mixtral-8x7b") || id.contains("mixtral-8x22b")) {
            return "strong";
        }
        
        // Weak models - small, fast, limited capability
        if (id.contains("qwen2.5-0.5b") || id.contains("qwen2.5-1.5b") || 
            id.contains("qwen2.5-1b") || id.contains("qwen2.5-3b") ||
            id.contains("0.5b") || id.contains("1b") || id.contains("1.5b") || id.contains("3b") ||
            id.contains("llama-3-8b") || id.contains("llama-3.1-8b") ||
            id.contains("gemma-2b") || id.contains("gemma-7b") ||
            id.contains("phi-2") || id.contains("phi-3-mini")) {
            return "weak";
        }
        
        // Medium models - everything else (13b-32b range typically)
        if (id.contains("13b") || id.contains("14b") || id.contains("16b") || 
            id.contains("20b") || id.contains("24b") || id.contains("32b") ||
            id.contains("qwen2.5-14b") || id.contains("qwen2.5-32b")) {
            return "medium";
        }
        
        // Default to medium for unknown models
        return "medium";
    }

    private Map<String, Object> buildRequestBody(ChatRequest request) {
        List<Map<String, String>> messages = new ArrayList<>();

        ChatRequest.ModelSettings requestSettings = request.getSettings();
        String model = (requestSettings != null && requestSettings.getModel() != null)
            ? requestSettings.getModel()
            : properties.getModel();
        String provider = requestSettings != null ? requestSettings.getProvider() : null;

        String sessionId = request.getSessionId();
        if (sessionId != null && !sessionId.isEmpty()) {
            // Load limited history from database using sessionId with summary
            var history = historyService.getLimitedHistoryWithSummary(sessionId, properties.getHistoryLimit());
            for (var msg : history) {
                Map<String, String> message = new HashMap<>();
                message.put("role", msg.getRole());
                message.put("content", msg.getContent());
                messages.add(message);
            }
        }

        // Add current user message
        Map<String, String> userMessage = new HashMap<>();
        userMessage.put("role", "user");
        userMessage.put("content", request.getMessage());
        messages.add(userMessage);

        Map<String, Object> requestBody = new HashMap<>();
        
        // Use model from request settings, fall back to properties
        requestBody.put("model", model);
        
        requestBody.put("messages", messages);
        requestBody.put("stream", false);
        
        // Use request settings if provided, otherwise fall back to properties
        
        if (requestSettings != null) {
            if (requestSettings.getTemperature() != null) {
                requestBody.put("temperature", requestSettings.getTemperature());
            } else if (properties.getTemperature() != null) {
                requestBody.put("temperature", properties.getTemperature());
            }
            
            if (requestSettings.getMaxTokens() != null) {
                // Only send max_tokens if it's not the default maximum value (16384)
                // This allows APIs to use their own defaults when not explicitly needed
                if (requestSettings.getMaxTokens() != 16384) {
                    requestBody.put("max_tokens", requestSettings.getMaxTokens());
                }
            } else if (properties.getMaxTokens() != null) {
                requestBody.put("max_tokens", properties.getMaxTokens());
            }
            
            if (requestSettings.getTopP() != null) {
                requestBody.put("top_p", requestSettings.getTopP());
            } else if (properties.getTopP() != null) {
                requestBody.put("top_p", properties.getTopP());
            }
            
            if (requestSettings.getFrequencyPenalty() != null) {
                requestBody.put("frequency_penalty", requestSettings.getFrequencyPenalty());
            } else if (properties.getFrequencyPenalty() != null) {
                requestBody.put("frequency_penalty", properties.getFrequencyPenalty());
            }
            
            if (requestSettings.getPresencePenalty() != null) {
                requestBody.put("presence_penalty", requestSettings.getPresencePenalty());
            } else if (properties.getPresencePenalty() != null) {
                requestBody.put("presence_penalty", properties.getPresencePenalty());
            }
            
            if (requestSettings.getStop() != null && !requestSettings.getStop().isEmpty()) {
                requestBody.put("stop", requestSettings.getStop());
            } else if (properties.getStop() != null && !properties.getStop().isEmpty()) {
                requestBody.put("stop", properties.getStop());
            }
        } else {
            if (properties.getTemperature() != null) {
                requestBody.put("temperature", properties.getTemperature());
            }
            if (properties.getMaxTokens() != null) {
                requestBody.put("max_tokens", properties.getMaxTokens());
            }
            if (properties.getTopP() != null) {
                requestBody.put("top_p", properties.getTopP());
            }
            if (properties.getFrequencyPenalty() != null) {
                requestBody.put("frequency_penalty", properties.getFrequencyPenalty());
            }
            if (properties.getPresencePenalty() != null) {
                requestBody.put("presence_penalty", properties.getPresencePenalty());
            }
            if (properties.getStop() != null && !properties.getStop().isEmpty()) {
                requestBody.put("stop", properties.getStop());
            }
        }

        return requestBody;
    }

    /**
     * Generate summary for old messages if needed.
     * Called after saving messages to check if summary should be created or updated.
     * Returns SummaryResult with text, request and response for debugging.
     */
    public SummaryResult generateSummaryIfNeeded(String sessionId, String provider, String model) {
        int historyLimit = properties.getHistoryLimit();
        var allMessages = historyService.getSessionHistory(sessionId);

        int oldMessageCount = allMessages.size() - historyLimit;
        if (oldMessageCount <= 0) {
            return null;
        }

        int existingSummaryIndex = findExistingSummaryIndex(allMessages, historyLimit);
        int startIndex;
        int endIndex;
        String existingSummary = null;

        if (existingSummaryIndex < 0) {
            startIndex = 0;
            endIndex = oldMessageCount;
        } else {
            startIndex = existingSummaryIndex + 1;
            int unsummarizedCount = oldMessageCount - startIndex;
            if (unsummarizedCount < 5) {
                return null;
            }
            endIndex = startIndex + 5;
            existingSummary = allMessages.get(existingSummaryIndex).getSummary();
        }

        try {
            SummaryResult result = generateSummaryText(
                sessionId, allMessages, startIndex, endIndex, provider, model, existingSummary);
            if (result != null && result.getSummaryText() != null) {
                historyService.generateAndSaveSummary(sessionId, historyLimit, result.getSummaryText(), endIndex - 1);
                logger.info("{} summary for session {}: indices {}-{}, {} characters",
                    existingSummary == null ? "Generated" : "Updated",
                    sessionId, startIndex, endIndex - 1, result.getSummaryText().length());
            }
            return result;
        } catch (Exception e) {
            logger.error("Failed to generate summary for session {}", sessionId, e);
            return null;
        }
    }

    private int findExistingSummaryIndex(List<ChatMessageDTO> allMessages, int historyLimit) {
        int oldMessageCount = allMessages.size() - historyLimit;
        for (int i = 0; i < oldMessageCount; i++) {
            String summary = allMessages.get(i).getSummary();
            if (summary != null && !summary.isEmpty()) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Call AI to generate or update a summary of a block of old messages.
     * If existingSummary is provided, merge it with new messages to preserve all facts.
     * Returns SummaryResult containing summary text, request and response for debugging.
     */
    private SummaryResult generateSummaryText(String sessionId, List<ChatMessageDTO> allMessages,
                                              int summarizeStartIndex, int summarizeEndIndex,
                                              String provider, String model, String existingSummary) {
        if (summarizeStartIndex < 0 || summarizeEndIndex <= summarizeStartIndex
            || summarizeEndIndex > allMessages.size()) {
            return new SummaryResult(existingSummary, null, null);
        }

        List<ChatMessageDTO> messagesToSummarize = allMessages.subList(summarizeStartIndex, summarizeEndIndex);
        
        // Build summary request
        StringBuilder summaryPrompt = new StringBuilder();
        
        if (existingSummary != null && !existingSummary.isEmpty()) {
            // UPDATE MODE: Merge existing summary with new messages
            summaryPrompt.append("You have an existing summary of a conversation. ");
            summaryPrompt.append("Update this summary by incorporating information from the new messages below.\n\n");
            summaryPrompt.append("RULES:\n");
            summaryPrompt.append("- PRESERVE ALL facts, names, preferences, and decisions from the existing summary\n");
            summaryPrompt.append("- DO NOT remove or change any existing information\n");
            summaryPrompt.append("- DO NOT invent anything that is not present in the conversation\n");
            summaryPrompt.append("- Add new topics, decisions, or conclusions from the new messages\n");
            summaryPrompt.append("- Write VERY SHORT bullet points (1-2 lines each)\n");
            summaryPrompt.append("- Be concise but keep ALL important details\n\n");
            summaryPrompt.append("EXISTING SUMMARY:\n");
            summaryPrompt.append(existingSummary).append("\n\n");
            summaryPrompt.append("NEW MESSAGES TO ADD:\n");
        } else {
            // NEW MODE: Create summary from scratch
            summaryPrompt.append("Summarize the following conversation history.\n\n");
            summaryPrompt.append("RULES:\n");
            summaryPrompt.append("- Keep all facts, names, preferences, and decisions mentioned\n");
            summaryPrompt.append("- DO NOT invent anything that is not present in the conversation\n");
            summaryPrompt.append("- Write VERY SHORT bullet points (1-2 lines each)\n");
            summaryPrompt.append("- Be concise but keep ALL important details\n\n");
        }
        
        for (ChatMessageDTO msg : messagesToSummarize) {
            String role = msg.getRole();
            String content = msg.getContent();
            summaryPrompt.append(role.toUpperCase()).append(": ").append(content).append("\n");
        }
        
        summaryPrompt.append("\nUpdated Summary:");
        
        // Create a minimal request for summary generation
        Map<String, Object> summaryRequest = new HashMap<>();
        summaryRequest.put("model", model != null ? model : properties.getModel());
        
        List<Map<String, String>> summaryMessages = new ArrayList<>();
        Map<String, String> userMsg = new HashMap<>();
        userMsg.put("role", "user");
        userMsg.put("content", summaryPrompt.toString());
        summaryMessages.add(userMsg);
        
        summaryRequest.put("messages", summaryMessages);
        summaryRequest.put("temperature", 0.3); // Lower temperature for more focused summary
        summaryRequest.remove("max_tokens"); // No limit - AI will generate as needed (writes short anyway)
        
        logger.info("Summary generation for session {}: mode={}, indices {}-{}, existingSummaryLength={}",
            sessionId,
            existingSummary != null ? "UPDATE" : "NEW",
            summarizeStartIndex,
            summarizeEndIndex - 1,
            existingSummary != null ? existingSummary.length() : 0);
        
        // Call AI API to generate summary
        try {
            String baseUrl = getBaseUrlForProvider(provider != null ? provider : properties.getProvider());
            String apiKey = getApiKeyForProvider(provider != null ? provider : properties.getProvider());
            
            WebClient summaryClient = WebClient.builder()
                    .baseUrl(baseUrl)
                    .clientConnector(new ReactorClientHttpConnector(HttpClient.create()))
                    .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(16 * 1024 * 1024))
                    .build();
            
            // Use reactive call on boundedElastic scheduler to avoid blocking
            Map<String, Object> summaryResponse = summaryClient.post()
                    .uri("/chat/completions")
                    .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                    .bodyValue(summaryRequest)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .publishOn(Schedulers.boundedElastic())
                    .block(Duration.ofSeconds(60)); // Increased timeout to 60 seconds
            
            String summaryContent = null;
            if (summaryResponse != null) {
                List<Map<String, Object>> choices = (List<Map<String, Object>>) summaryResponse.get("choices");
                if (choices != null && !choices.isEmpty()) {
                    Map<String, String> message = (Map<String, String>) choices.get(0).get("message");
                    if (message != null) {
                        summaryContent = message.get("content");
                        // Trim summary, remove "Updated Summary:" prefix if present
                        summaryContent = summaryContent != null ? summaryContent.trim() : null;
                    }
                }
            }
            
            if (summaryContent == null) {
                logger.warn("Failed to generate summary: empty response from AI");
                summaryContent = existingSummary != null ? existingSummary : "Previous conversation history summarized.";
            }
            
            // Return SummaryResult with text, request and response for debugging
            return new SummaryResult(summaryContent, summaryRequest, summaryResponse);
            
        } catch (Exception e) {
            logger.error("Error generating summary", e);
            String fallback = existingSummary != null ? existingSummary : "Previous conversation history available.";
            return new SummaryResult(fallback, null, null);
        }
    }

}
