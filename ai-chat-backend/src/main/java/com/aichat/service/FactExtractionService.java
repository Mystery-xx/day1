package com.aichat.service;

import com.aichat.config.AiChatProperties;
import com.aichat.dto.ChatMessageDTO;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Collections;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class FactExtractionService {

    private static final Logger logger = LoggerFactory.getLogger(FactExtractionService.class);

    private final WebClient webClient;
    private final AiChatProperties properties;
    private final ObjectMapper objectMapper;
    private final ChatHistoryService historyService;
    private final StickyFactService stickyFactService;

    private static final String EXTRACTION_PROMPT_TEMPLATE =
        "Extract key facts from this conversation as a JSON object. Focus on:\n" +
        "- User preferences (tools, languages, frameworks, styles)\n" +
        "- Project details (name, purpose, requirements, constraints)\n" +
        "- Technical decisions (architecture, libraries, patterns chosen)\n" +
        "- Important entities (names, organizations, technologies mentioned)\n" +
        "- User constraints (deadlines, budget, technical limitations)\n\n" +
        "RULES:\n" +
        "- Extract ONLY facts that are likely to remain relevant throughout the conversation\n" +
        "- Do NOT extract temporary or context-specific information\n" +
        "- Return a JSON object where keys are fact names and values are descriptions\n" +
        "- Use snake_case for keys (e.g., preferred_language, project_type)\n" +
        "- Keep values brief (1 sentence max)\n" +
        "- Return ONLY the JSON object, no other text\n\n" +
        "Example response: {\"preferred_language\": \"Russian\", \"project_type\": \"Minecraft building\"}\n\n" +
        "CONVERSATION HISTORY:\n";

    public FactExtractionService(AiChatProperties properties, ChatHistoryService historyService,
                                 StickyFactService stickyFactService) {
        this.properties = properties;
        this.historyService = historyService;
        this.stickyFactService = stickyFactService;
        this.objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());
        
        HttpClient httpClient = HttpClient.create()
                .responseTimeout(Duration.ofSeconds(60));
        
        this.webClient = WebClient.builder()
                .baseUrl(properties.getProviderBaseUrl())
                .clientConnector(new org.springframework.http.client.reactive.ReactorClientHttpConnector(httpClient))
                .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(16 * 1024 * 1024))
                .build();
    }

    /**
     * Extract facts from conversation history and save them to the database.
     * Extracts facts from all messages since last extraction, or all messages if never extracted before.
     * 
     * @param sessionId The session ID
     * @param model The model to use for extraction
     * @param provider The provider to use (optional, falls back to default)
     * @return Map of extracted facts (empty if none found or error occurred)
     */
    public Map<String, String> extractAndSaveFacts(String sessionId, String model, String provider) {
        try {
            List<ChatMessageDTO> history = historyService.getSessionHistory(sessionId);
            
            if (history.size() < 3) {
                logger.debug("Skipping fact extraction for session {}: not enough messages ({})", sessionId, history.size());
                return Collections.emptyMap();
            }
            
            var existingFacts = stickyFactService.getFacts(sessionId);
            
            List<ChatMessageDTO> messagesToProcess;
            if (existingFacts != null && !existingFacts.isEmpty()) {
                int lastExtractionMessageCount = findLastExtractionCheckpoint(sessionId, history);
                if (lastExtractionMessageCount > 0 && lastExtractionMessageCount < history.size()) {
                    messagesToProcess = history.subList(lastExtractionMessageCount, history.size());
                    logger.info("Processing {} new messages since last extraction (checkpoint: {}, total: {})", 
                        messagesToProcess.size(), lastExtractionMessageCount, history.size());
                } else {
                    messagesToProcess = history;
                    logger.info("No checkpoint found, processing all {} messages for session {}", 
                        history.size(), sessionId);
                }
            } else {
                messagesToProcess = history;
                logger.info("First-time fact extraction from all {} messages for session {}", 
                    history.size(), sessionId);
            }
            
            logger.info("Extracting facts from {} messages for session {}", messagesToProcess.size(), sessionId);
            
            Map<String, String> extractedFacts = extractFactsFromMessages(messagesToProcess, model, provider);
            
            if (!extractedFacts.isEmpty()) {
                logger.info("Extracted {} facts for session {}: {}", extractedFacts.size(), sessionId, extractedFacts.keySet());
                Map<String, String> mergedFacts = new HashMap<>();
                if (existingFacts != null) {
                    for (var fact : existingFacts) {
                        mergedFacts.put(fact.getFactKey(), fact.getFactValue());
                    }
                }
                mergedFacts.putAll(extractedFacts);
                
                stickyFactService.deleteFactsBySession(sessionId);
                stickyFactService.saveAutoExtractedFacts(sessionId, mergedFacts);
                
                saveExtractionCheckpoint(sessionId, history.size());
            } else {
                logger.debug("No facts extracted from session {}", sessionId);
            }
            
            return extractedFacts;
            
        } catch (Exception e) {
            logger.error("Failed to extract facts for session {}", sessionId, e);
            return Collections.emptyMap();
        }
    }
    
    /**
     * Find the message count at the time of last fact extraction.
     * Reads checkpoint from session metadata or returns 0 if not found.
     */
    private int findLastExtractionCheckpoint(String sessionId, List<ChatMessageDTO> history) {
        try {
            var lastFact = stickyFactService.getFacts(sessionId)
                .stream()
                .max((a, b) -> {
                    if (a.getCreatedAt() == null && b.getCreatedAt() == null) return 0;
                    if (a.getCreatedAt() == null) return -1;
                    if (b.getCreatedAt() == null) return 1;
                    return a.getCreatedAt().compareTo(b.getCreatedAt());
                });
            
            if (lastFact.isPresent() && lastFact.get().getCreatedAt() != null) {
                var extractionTime = lastFact.get().getCreatedAt();
                long count = history.stream()
                    .filter(msg -> msg.getCreatedAt() != null && msg.getCreatedAt().isBefore(extractionTime))
                    .count();
                logger.debug("Found checkpoint at message {} based on last fact timestamp", count);
                return (int) count;
            }
        } catch (Exception e) {
            logger.debug("Could not find extraction checkpoint: {}", e.getMessage());
        }
        return 0;
    }
    
    /**
     * Save the current message count as extraction checkpoint.
     */
    private void saveExtractionCheckpoint(String sessionId, int messageCount) {
        logger.debug("Saved extraction checkpoint at message {} for session {}", messageCount, sessionId);
    }

    /**
     * Extract facts from a list of chat messages using AI.
     */
    private Map<String, String> extractFactsFromMessages(List<ChatMessageDTO> messages, String model, String provider) {
        if (messages == null || messages.isEmpty()) {
            return Collections.emptyMap();
        }
        
        // Build conversation text
        StringBuilder conversationText = new StringBuilder();
        for (ChatMessageDTO msg : messages) {
            String role = msg.getRole();
            String content = msg.getContent();
            conversationText.append(role.toUpperCase()).append(": ").append(content).append("\n");
        }
        
        logger.debug("Conversation history ({} messages): {}", messages.size(), conversationText.length());
        
        // Build prompt
        String prompt = EXTRACTION_PROMPT_TEMPLATE + conversationText.toString() + "\n\nEXTRACTED FACTS:\n";
        
        logger.debug("Fact extraction prompt length: {}", prompt.length());
        
        // Build request
        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("model", model != null ? model : properties.getModel());
        
        List<Map<String, String>> requestMessages = new ArrayList<>();
        Map<String, String> userMsg = new HashMap<>();
        userMsg.put("role", "user");
        userMsg.put("content", prompt);
        requestMessages.add(userMsg);
        requestBody.put("messages", requestMessages);
        requestBody.put("temperature", 0.3); // Lower temperature for focused extraction
        
        try {
            String baseUrl = getBaseUrlForProvider(provider);
            String apiKey = getApiKeyForProvider(provider);
            
            logger.debug("Calling AI API for fact extraction: baseUrl={}, model={}", baseUrl, requestBody.get("model"));
            
            // Use reactive call on boundedElastic scheduler
            Map<String, Object> response = webClient.post()
                    .uri("/chat/completions")
                    .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                    .bodyValue(requestBody)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .publishOn(Schedulers.boundedElastic())
                    .block(Duration.ofSeconds(30));
            
            if (response == null) {
                logger.warn("Null response from AI API for fact extraction");
                return Collections.emptyMap();
            }
            
            List<Map<String, Object>> choices = (List<Map<String, Object>>) response.get("choices");
            if (choices == null || choices.isEmpty()) {
                logger.warn("Empty choices from AI API for fact extraction");
                return Collections.emptyMap();
            }
            
            Map<String, Object> choice = choices.get(0);
            logger.debug("Full AI choice: {}", choice);
            
            Map<String, String> message = (Map<String, String>) choice.get("message");
            if (message == null) {
                logger.warn("Null message from AI API for fact extraction");
                return Collections.emptyMap();
            }
            
            String content = message.get("content");
            logger.debug("Raw content from AI: '{}'", content);
            
            if (content == null || content.trim().isEmpty()) {
                logger.debug("Empty content from AI API for fact extraction");
                return Collections.emptyMap();
            }
            
            // Parse the response into key-value pairs
            Map<String, String> facts = parseFactsFromResponse(content);
            logger.debug("Parsed {} facts from response", facts.size());
            return facts;
            
        } catch (Exception e) {
            logger.error("Error extracting facts via AI API", e);
            return Collections.emptyMap();
        }
    }

    /**
     * Parse the AI response into a map of key-value facts.
     * Tries to parse as JSON first, falls back to KEY: VALUE format.
     */
    @SuppressWarnings("unchecked")
    private Map<String, String> parseFactsFromResponse(String content) {
        Map<String, String> facts = new HashMap<>();
        
        if (content == null || content.trim().isEmpty()) {
            return facts;
        }
        
        String trimmed = content.trim();
        
        // Try JSON parsing first
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            try {
                Map<String, String> jsonFacts = objectMapper.readValue(trimmed, Map.class);
                if (jsonFacts != null) {
                    for (Map.Entry<String, String> entry : jsonFacts.entrySet()) {
                        String key = normalizeKey(entry.getKey());
                        String value = entry.getValue().trim();
                        if (!key.isEmpty() && !value.isEmpty()) {
                            facts.put(key, value);
                        }
                    }
                }
                return facts;
            } catch (Exception e) {
                logger.debug("JSON parsing failed, falling back to line parsing: {}", e.getMessage());
            }
        }
        
        // Fallback: Parse line by line (KEY: VALUE format)
        String[] lines = content.split("\n");
        Pattern pattern = Pattern.compile("^\\s*([\\w\\s]+?)\\s*[:=]\\s*(.+?)\\s*$");
        
        for (String line : lines) {
            line = line.trim();
            if (line.isEmpty() || line.startsWith("-") || line.startsWith("*") || line.startsWith("{") || line.startsWith("}")) {
                continue;
            }
            
            Matcher matcher = pattern.matcher(line);
            if (matcher.matches()) {
                String key = matcher.group(1).trim();
                String value = matcher.group(2).trim();
                key = normalizeKey(key);
                
                if (!key.isEmpty() && !value.isEmpty()) {
                    facts.put(key, value);
                }
            }
        }
        
        return facts;
    }

    /**
     * Normalize a fact key to a consistent format.
     */
    private String normalizeKey(String key) {
        // Convert to lowercase and replace spaces with underscores
        return key.toLowerCase()
                .replaceAll("\\s+", "_")
                .replaceAll("[^a-z0-9_]", "")
                .replaceAll("_+", "_")
                .replaceAll("^_|_$", "");
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
}
