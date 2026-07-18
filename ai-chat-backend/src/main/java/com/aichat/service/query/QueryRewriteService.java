package com.aichat.service.query;

import com.aichat.config.AiChatProperties;
import com.aichat.config.query.QueryRewriteProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Service
public class QueryRewriteService {

    private static final Logger logger = LoggerFactory.getLogger(QueryRewriteService.class);
    private static final String PROMPT_TEMPLATE = "Rewrite this search query to be more specific and detailed: {query}";
    private static final int WORD_COUNT_THRESHOLD = 10;

    private final WebClient webClient;
    private final AiChatProperties aiProperties;
    private final QueryRewriteProperties rewriteProperties;
    private final ObjectMapper objectMapper;
    private final Cache<String, String> rewriteCache;

    public QueryRewriteService(AiChatProperties aiProperties, QueryRewriteProperties rewriteProperties) {
        this.aiProperties = aiProperties;
        this.rewriteProperties = rewriteProperties;
        this.objectMapper = new ObjectMapper();
        
        // Caffeine cache: 1000 entries, 5min TTL
        this.rewriteCache = Caffeine.newBuilder()
                .maximumSize(1000)
                .expireAfterWrite(5, TimeUnit.MINUTES)
                .build();
        
        this.webClient = WebClient.builder()
                .baseUrl(aiProperties.getProviderBaseUrl())
                .build();
    }

    /**
     * Rewrite a search query to be more specific and detailed.
     * Returns original query if:
     * - Query has >= 10 words (already detailed)
     * - Rewrite is disabled in config
     * - AI call times out or fails
     *
     * @param query the original search query
     * @return rewritten query or original if skipped/failed
     */
    public String rewrite(String query) {
        if (query == null || query.trim().isEmpty()) {
            logger.debug("Query rewrite skipped: empty query");
            return query;
        }

        // Skip if rewrite is disabled
        if (!rewriteProperties.isEnabled()) {
            logger.debug("Query rewrite disabled in config");
            return query;
        }

        // Skip if query is already detailed (>= 10 words)
        int wordCount = countWords(query);
        if (wordCount >= WORD_COUNT_THRESHOLD) {
            logger.debug("Query rewrite skipped: query has {} words (threshold: {})", wordCount, WORD_COUNT_THRESHOLD);
            return query;
        }

        // Check cache
        String cached = rewriteCache.getIfPresent(query);
        if (cached != null) {
            logger.debug("Query rewrite cache hit for: '{}'", query);
            return cached;
        }

        // Call AI to rewrite
        try {
            String rewritten = callAiRewrite(query);
            
            // Cache the result
            rewriteCache.put(query, rewritten);
            
            // Log the rewrite
            logger.info("Query rewritten: '{}' → '{}'", query, rewritten);
            
            return rewritten;
            
        } catch (Exception e) {
            logger.warn("Query rewrite failed for '{}', using original: {}", query, e.getMessage());
            // Return original on failure (fallback behavior)
            return query;
        }
    }

    private String callAiRewrite(String query) {
        String prompt = PROMPT_TEMPLATE.replace("{query}", query);
        
        Map<String, Object> requestBody = buildRequestBody(prompt);
        
        try {
            // Synchronous call with timeout
            Map<String, Object> response = webClient.post()
                    .uri("/chat/completions")
                    .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + aiProperties.getKey())
                    .bodyValue(requestBody)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .publishOn(Schedulers.boundedElastic())
                    .block(Duration.ofSeconds(rewriteProperties.getTimeoutSeconds()));
            
            if (response != null) {
                List<Map<String, Object>> choices = (List<Map<String, Object>>) response.get("choices");
                if (choices != null && !choices.isEmpty()) {
                    Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");
                    if (message != null) {
                        String content = (String) message.get("content");
                        if (content != null && !content.trim().isEmpty()) {
                            return content.trim();
                        }
                    }
                }
            }
            
            // Fallback to original if response is invalid
            return query;
            
        } catch (WebClientResponseException e) {
            logger.warn("AI API error during query rewrite: {}", e.getStatusCode());
            throw new RuntimeException("AI API error: " + e.getMessage(), e);
        } catch (Exception e) {
            logger.warn("Timeout or error during query rewrite: {}", e.getMessage());
            throw new RuntimeException("Query rewrite timeout/failure", e);
        }
    }

    private Map<String, Object> buildRequestBody(String prompt) {
        Map<String, Object> requestBody = new HashMap<>();
        
        // Use configured model
        String model = rewriteProperties.getModel();
        if ("default-chat".equals(model)) {
            model = aiProperties.getModel();
        }
        requestBody.put("model", model);
        
        // Build messages
        List<Map<String, String>> messages = new ArrayList<>();
        Map<String, String> userMessage = new HashMap<>();
        userMessage.put("role", "user");
        userMessage.put("content", prompt);
        messages.add(userMessage);
        
        requestBody.put("messages", messages);
        requestBody.put("stream", false);
        
        // Use lower temperature for focused rewriting
        requestBody.put("temperature", 0.3);
        requestBody.put("max_tokens", 200);
        
        return requestBody;
    }

    private int countWords(String text) {
        if (text == null || text.trim().isEmpty()) {
            return 0;
        }
        return text.trim().split("\\s+").length;
    }
}
