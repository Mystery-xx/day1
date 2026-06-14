package com.aichat.service;

import com.aichat.dto.ChatMessageDTO;
import com.aichat.dto.SessionInfoDTO;
import com.aichat.entity.ChatMessage;
import com.aichat.repository.ChatMessageRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@Transactional
public class ChatHistoryService {
    
    private final ChatMessageRepository repository;
    
    public ChatHistoryService(ChatMessageRepository repository) {
        this.repository = repository;
    }
    
    public String createSession() {
        return UUID.randomUUID().toString();
    }
    
    public List<ChatMessageDTO> getSessionHistory(String sessionId) {
        return repository.findBySessionIdOrderByCreatedAtAsc(sessionId)
            .stream()
            .map(this::toDTO)
            .collect(Collectors.toList());
    }
    
    public List<SessionInfoDTO> getAllSessions(int limit, int offset) {
        // Temporary stub to avoid H2 DISTINCT + ORDER BY issue
        // Returns empty list until repository query is fixed
        return List.of();
    }
    
    public ChatMessageDTO saveMessage(String sessionId, String role, String content, 
                                       String model, Integer promptTokens, 
                                       Integer completionTokens, Integer totalTokens,
                                       Integer responseTimeMs, String provider,
                                       Double temperature, Integer maxTokens) {
        ChatMessage message = new ChatMessage();
        message.setSessionId(sessionId);
        message.setRole(ChatMessage.Role.valueOf(role.toUpperCase()));
        message.setContent(content);
        message.setModel(model);
        message.setPromptTokens(promptTokens);
        message.setCompletionTokens(completionTokens);
        message.setTotalTokens(totalTokens);
        message.setResponseTimeMs(responseTimeMs);
        message.setProvider(provider);
        message.setTemperature(temperature);
        message.setMaxTokens(maxTokens);
        message.setCreatedAt(Instant.now());
        
        ChatMessage saved = repository.save(message);
        return toDTO(saved);
    }
    
    public void deleteSession(String sessionId) {
        repository.deleteBySessionId(sessionId);
    }
    
    public void deleteAllSessions() {
        repository.deleteAll();
    }
    
    private ChatMessageDTO toDTO(ChatMessage entity) {
        ChatMessageDTO dto = new ChatMessageDTO();
        dto.setId(entity.getId());
        dto.setSessionId(entity.getSessionId());
        dto.setRole(entity.getRole().name().toLowerCase());
        dto.setContent(entity.getContent());
        dto.setModel(entity.getModel());
        dto.setPromptTokens(entity.getPromptTokens());
        dto.setCompletionTokens(entity.getCompletionTokens());
        dto.setTotalTokens(entity.getTotalTokens());
        dto.setResponseTimeMs(entity.getResponseTimeMs());
        dto.setProvider(entity.getProvider());
        dto.setTemperature(entity.getTemperature());
        dto.setMaxTokens(entity.getMaxTokens());
        dto.setCreatedAt(entity.getCreatedAt());
        return dto;
    }
    
    private SessionInfoDTO toSessionInfo(String sessionId) {
        List<ChatMessage> messages = repository.findBySessionIdLatestFirst(sessionId);
        SessionInfoDTO info = new SessionInfoDTO();
        info.setSessionId(sessionId);
        info.setMessageCount((long) messages.size());
        
        if (!messages.isEmpty()) {
            info.setCreatedAt(messages.get(messages.size() - 1).getCreatedAt());
            info.setLastMessageAt(messages.get(0).getCreatedAt());
            
            ChatMessage latest = messages.get(0);
            info.setPreview(latest.getContent().substring(0, Math.min(50, latest.getContent().length())));
        }
        
        return info;
    }
}
