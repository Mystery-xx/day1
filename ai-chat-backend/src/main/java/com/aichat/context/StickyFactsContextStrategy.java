package com.aichat.context;

import com.aichat.dto.ChatMessageDTO;
import com.aichat.dto.ChatRequest;
import com.aichat.service.ChatHistoryService;
import com.aichat.service.StickyFactService;
import com.aichat.service.FactExtractionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class StickyFactsContextStrategy implements ContextStrategy {

    private static final Logger logger = LoggerFactory.getLogger(StickyFactsContextStrategy.class);

    private final ChatHistoryService historyService;
    private final StickyFactService stickyFactService;
    private final FactExtractionService factExtractionService;

    private static final int EXTRACTION_INTERVAL = 3; // Extract after every N messages

    public StickyFactsContextStrategy(ChatHistoryService historyService, StickyFactService stickyFactService,
                                      FactExtractionService factExtractionService) {
        this.historyService = historyService;
        this.stickyFactService = stickyFactService;
        this.factExtractionService = factExtractionService;
    }

    @Override
    public List<ChatMessageDTO> buildContext(String sessionId, ChatRequest.ModelSettings settings) {
        logger.debug("Building sticky facts context for session {}", sessionId);
        int windowSize = resolveWindowSize(settings);
        
        // Trigger fact extraction if needed (throttled)
        maybeExtractFacts(sessionId, settings);
        
        Map<String, String> facts = collectFacts(sessionId, settings);
        logger.info("Including {} sticky facts in context for session {}", facts.size(), sessionId);

        List<ChatMessageDTO> result = new ArrayList<>();

        List<ChatMessageDTO> history = historyService.getSessionHistory(sessionId);
        if (history.size() > windowSize) {
            result.addAll(history.subList(history.size() - windowSize, history.size()));
        } else {
            result.addAll(history);
        }

        return result;
    }

    /**
     * Trigger fact extraction periodically based on message count.
     * Uses a simple counter to extract after every N messages.
     */
    private void maybeExtractFacts(String sessionId, ChatRequest.ModelSettings settings) {
        // Check if auto-extraction is enabled (can be disabled via settings)
        if (settings != null && Boolean.FALSE.equals(settings.getAutoExtractFacts())) {
            logger.debug("Auto-extraction disabled for session {}", sessionId);
            return;
        }
        
        int count = stickyFactService.incrementMessageCount(sessionId);
        logger.info("Message count for session {}: {} (extraction at {})", sessionId, count, EXTRACTION_INTERVAL);
        
        if (count % EXTRACTION_INTERVAL == 0) {
            logger.info("Triggering fact extraction for session {} (message count: {})", sessionId, count);
            String model = settings != null ? settings.getModel() : null;
            String provider = settings != null ? settings.getProvider() : null;
            Map<String, String> extracted = factExtractionService.extractAndSaveFacts(sessionId, model, provider);
            logger.info("Extracted {} facts: {}", extracted.size(), extracted.keySet());
        }
    }

    private Map<String, String> collectFacts(String sessionId, ChatRequest.ModelSettings settings) {
        Map<String, String> facts = new LinkedHashMap<>();

        // Persist facts sent from the frontend first, then load all stored facts.
        if (settings != null && settings.getStickyFacts() != null) {
            stickyFactService.saveFacts(sessionId, settings.getStickyFacts());
        }

        Map<String, String> storedFacts = stickyFactService.getFactsAsMap(sessionId);
        if (storedFacts != null) {
            facts.putAll(storedFacts);
        }

        // Facts from settings take precedence (temporary overrides).
        if (settings != null && settings.getStickyFacts() != null) {
            facts.putAll(settings.getStickyFacts());
        }

        return facts;
    }

    private String buildFactsContent(Map<String, String> facts) {
        StringBuilder content = new StringBuilder("Important facts to remember about this conversation:\n");
        for (Map.Entry<String, String> entry : facts.entrySet()) {
            content.append("- ").append(entry.getKey()).append(": ").append(entry.getValue()).append("\n");
        }
        return content.toString().trim();
    }

    private int resolveWindowSize(ChatRequest.ModelSettings settings) {
        if (settings != null && settings.getContextWindowSize() != null && settings.getContextWindowSize() > 0) {
            return settings.getContextWindowSize();
        }
        return 10;
    }
}
