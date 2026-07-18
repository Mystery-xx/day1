package com.aichat.context;

import com.aichat.dto.ChatMessageDTO;
import com.aichat.dto.ChatRequest;
import com.aichat.service.ChatHistoryService;

import java.util.List;

public class SlidingWindowContextStrategy implements ContextStrategy {

    private final ChatHistoryService historyService;

    public SlidingWindowContextStrategy(ChatHistoryService historyService) {
        this.historyService = historyService;
    }

    @Override
    public List<ChatMessageDTO> buildContext(String sessionId, ChatRequest.ModelSettings settings) {
        int windowSize = resolveWindowSize(settings);
        List<ChatMessageDTO> history = historyService.getSessionHistory(sessionId);

        if (history.size() <= windowSize) {
            return history;
        }

        return history.subList(history.size() - windowSize, history.size());
    }

    private int resolveWindowSize(ChatRequest.ModelSettings settings) {
        if (settings != null && settings.getContextWindowSize() != null && settings.getContextWindowSize() > 0) {
            return settings.getContextWindowSize();
        }
        return 10;
    }
}
