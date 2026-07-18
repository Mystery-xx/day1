package com.aichat.context;

import com.aichat.config.AiChatProperties;
import com.aichat.service.ChatHistoryService;
import com.aichat.service.StickyFactService;
import com.aichat.service.FactExtractionService;
import org.springframework.stereotype.Component;

@Component
public class ContextStrategyFactory {

    private final ChatHistoryService historyService;
    private final StickyFactService stickyFactService;
    private final FactExtractionService factExtractionService;
    private final AiChatProperties properties;

    public ContextStrategyFactory(ChatHistoryService historyService,
                                  StickyFactService stickyFactService,
                                  FactExtractionService factExtractionService,
                                  AiChatProperties properties) {
        this.historyService = historyService;
        this.stickyFactService = stickyFactService;
        this.factExtractionService = factExtractionService;
        this.properties = properties;
    }

    public ContextStrategy createStrategy(ContextStrategyType type) {
        return switch (type) {
            case SLIDING_WINDOW -> new SlidingWindowContextStrategy(historyService);
            case STICKY_FACTS -> new StickyFactsContextStrategy(historyService, stickyFactService, factExtractionService);
            default -> new SummaryContextStrategy(historyService, properties);
        };
    }
}
