package com.aichat.service.codereview;

import com.aichat.config.AiChatProperties;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Mono;
import reactor.netty.http.client.HttpClient;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.core.ParameterizedTypeReference;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Abstract base for all code review agent services.
 * Provides shared AI API calling logic, prompt loading, and JSON response parsing.
 * Each agent implements {@link CodeReviewAgent} and provides its own prompt file.
 */
public abstract class AbstractCodeReviewAgent implements CodeReviewAgent {

    private static final Logger logger = LoggerFactory.getLogger(AbstractCodeReviewAgent.class);

    protected final AiChatProperties properties;
    protected final ObjectMapper objectMapper;
    protected final WebClient webClient;
    protected final int agentTimeoutSeconds;

    private static final AtomicInteger agentCounter = new AtomicInteger(0);
    private final int agentId = agentCounter.incrementAndGet();

    protected AbstractCodeReviewAgent(AiChatProperties properties, int agentTimeoutSeconds) {
        this.properties = properties;
        this.objectMapper = new ObjectMapper();
        this.agentTimeoutSeconds = agentTimeoutSeconds;

        HttpClient httpClient = HttpClient.create()
                .responseTimeout(Duration.ofSeconds(agentTimeoutSeconds));

        String baseUrl = properties.getProviderBaseUrl();
        this.webClient = WebClient.builder()
                .baseUrl(baseUrl)
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(16 * 1024 * 1024))
                .build();
    }

    /**
     * Get the path to the prompt markdown file for this agent.
     * Prompts are loaded from the classpath or external prompts/ directory.
     */
    protected abstract String getPromptPath();

    /**
     * Load the prompt content from the file system or classpath.
     */
    protected String loadPrompt() {
        String promptPath = getPromptPath();
        try {
            // Try classpath first (for packaged JAR)
            var inputStream = getClass().getClassLoader().getResourceAsStream(promptPath);
            if (inputStream != null) {
                return new String(inputStream.readAllBytes());
            }
            // Try file system (for development)
            Path filePath = Path.of(promptPath);
            if (Files.exists(filePath)) {
                return Files.readString(filePath);
            }
            // Try prompts/ relative to working dir
            Path altPath = Path.of("prompts", promptPath);
            if (Files.exists(altPath)) {
                return Files.readString(altPath);
            }
        } catch (IOException e) {
            logger.warn("Failed to load prompt from '{}': {}", promptPath, e.getMessage());
        }
        logger.warn("Prompt file not found at '{}', using default prompt", promptPath);
        return getDefaultPrompt();
    }

    /**
     * Default prompt fallback if prompt file cannot be loaded.
     */
    protected abstract String getDefaultPrompt();

    /**
     * Call the AI API with a system prompt and diff content, parse JSON response.
     */
    protected List<Map<String, Object>> callAiApi(String systemPrompt, DiffContext context) {
        try {
            // Build the request body
            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("model", properties.getModel());

            List<Map<String, Object>> messages = List.of(
                    Map.of("role", "system", "content", systemPrompt),
                    Map.of("role", "user", "content", buildUserMessage(context))
            );
            requestBody.put("messages", messages);
            requestBody.put("max_tokens", maxTokens());
            requestBody.put("temperature", 0.1); // Low temperature for deterministic output

            String apiKey = properties.getKey();
            logger.debug("[Agent {}] Sending review request to AI API, model={}", agentId, properties.getModel());

            // Make the API call (blocking for simplicity in synchronous review flow)
            Map<String, Object> response = webClient.post()
                    .uri("/chat/completions")
                    .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                    .bodyValue(requestBody)
                    .retrieve()
                    .bodyToMono(new ParameterizedTypeReference<Map<String, Object>>() {})
                    .timeout(Duration.ofSeconds(agentTimeoutSeconds))
                    .onErrorResume(e -> {
                        logger.error("[Agent {}] AI API call failed: {}", agentId, e.getMessage());
                        return Mono.empty();
                    })
                    .block();

            if (response == null) {
                logger.warn("[Agent {}] Empty response from AI API", agentId);
                return Collections.emptyList();
            }

            return parseFindingsFromResponse(response);

        } catch (Exception e) {
            logger.error("[Agent {}] Error calling AI API: {}", agentId, e.getMessage());
            return Collections.emptyList();
        }
    }

    protected String buildUserMessage(DiffContext context) {
        StringBuilder sb = new StringBuilder();

        sb.append("## Diff Context\n\n");
        sb.append("```diff\n");
        sb.append(context.getUnifiedDiff());
        sb.append("\n```\n\n");

        sb.append("## Changed Files\n\n");
        if (context.getChangedFiles() != null) {
            for (FileChange fc : context.getChangedFiles()) {
                sb.append("- `").append(fc.getFilename())
                  .append("` (+").append(fc.getAdditions())
                  .append("/-").append(fc.getDeletions()).append(")");
                if (fc.isBinary()) {
                    sb.append(" [binary]");
                }
                sb.append("\n");
            }
        }

        if (context.getRagContext() != null && !context.getRagContext().isBlank()) {
            sb.append("\n## Project Context (RAG)\n\n");
            sb.append(context.getRagContext());
            sb.append("\n");
        }

        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    protected List<Map<String, Object>> parseFindingsFromResponse(Map<String, Object> response) {
        try {
            List<Map<String, Object>> choices = (List<Map<String, Object>>) response.get("choices");
            if (choices == null || choices.isEmpty()) {
                return Collections.emptyList();
            }

            Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");
            if (message == null) {
                return Collections.emptyList();
            }

            String content = (String) message.get("content");
            if (content == null || content.isBlank()) {
                return Collections.emptyList();
            }

            // Clean the content - remove markdown code fences if present
            content = content.trim();
            if (content.startsWith("```json")) {
                content = content.substring(7);
            } else if (content.startsWith("```")) {
                content = content.substring(3);
            }
            if (content.endsWith("```")) {
                content = content.substring(0, content.length() - 3);
            }
            content = content.trim();

            // Parse JSON
            return objectMapper.readValue(content, new TypeReference<List<Map<String, Object>>>() {});
        } catch (Exception e) {
            logger.warn("[Agent {}] Failed to parse AI response as JSON: {}", agentId, e.getMessage());
            return Collections.emptyList();
        }
    }

    protected ReviewResult buildResult(List<Map<String, Object>> rawFindings, long startTime) {
        List<Finding> findings = rawFindings.stream()
                .map(this::mapToFinding)
                .toList();

        long reviewTimeMs = System.currentTimeMillis() - startTime;
        ReviewResult result = new ReviewResult(findings, 0, reviewTimeMs);
        result.setTokenUsage(estimateTokenUsage(rawFindings));
        return result;
    }

    protected Finding mapToFinding(Map<String, Object> raw) {
        Finding f = new Finding();
        f.setFile((String) raw.getOrDefault("file", ""));
        Object lineObj = raw.get("line");
        f.setLine(lineObj instanceof Number ? ((Number) lineObj).intValue() : 0);
        f.setSeverity(parseSeverity((String) raw.getOrDefault("severity", "INFO")));
        f.setDescription((String) raw.getOrDefault("description", ""));
        f.setSuggestion((String) raw.getOrDefault("suggestion", ""));
        f.setCategory(agentName());
        return f;
    }

    protected Severity parseSeverity(String s) {
        if (s == null) return Severity.INFO;
        try {
            return Severity.valueOf(s.toUpperCase());
        } catch (IllegalArgumentException e) {
            return Severity.INFO;
        }
    }

    protected int estimateTokenUsage(List<Map<String, Object>> findings) {
        // Rough estimate: ~4 chars per token for English text
        int chars = 0;
        for (Map<String, Object> f : findings) {
            chars += ((String) f.getOrDefault("description", "")).length();
            chars += ((String) f.getOrDefault("suggestion", "")).length();
        }
        return chars / 4;
    }
}
