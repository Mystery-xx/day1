package com.aichat.context;

import com.aichat.dto.ChatMessageDTO;
import com.aichat.dto.ChatRequest;
import com.aichat.service.ChatHistoryService;
import com.aichat.config.AiChatProperties;

import java.util.List;

public class SummaryContextStrategy implements ContextStrategy {

    private final ChatHistoryService historyService;
    private final AiChatProperties properties;

    public SummaryContextStrategy(ChatHistoryService historyService, AiChatProperties properties) {
        this.historyService = historyService;
        this.properties = properties;
    }

    @Override
    public List<ChatMessageDTO> buildContext(String sessionId, ChatRequest.ModelSettings settings) {
        int historyLimit = resolveHistoryLimit(settings);
        return historyService.getLimitedHistoryWithSummary(sessionId, historyLimit);
    }

    private int resolveHistoryLimit(ChatRequest.ModelSettings settings) {
        if (settings != null && settings.getContextWindowSize() != null && settings.getContextWindowSize() > 0) {
            return settings.getContextWindowSize();
        }
        int configLimit = properties.getHistoryLimit();
        return configLimit > 0 ? configLimit : 10;
    }
}
