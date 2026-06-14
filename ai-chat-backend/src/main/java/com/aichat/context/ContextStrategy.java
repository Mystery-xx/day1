package com.aichat.context;

import com.aichat.dto.ChatMessageDTO;
import com.aichat.dto.ChatRequest;

import java.util.List;

public interface ContextStrategy {
    List<ChatMessageDTO> buildContext(String sessionId, ChatRequest.ModelSettings settings);
}
