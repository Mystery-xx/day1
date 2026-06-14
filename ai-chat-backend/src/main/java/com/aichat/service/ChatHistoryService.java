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
    
    @Transactional(readOnly = true)
    public List<SessionInfoDTO> getAllSessions(int limit, int offset) {
        List<String> sessionIds = repository.findAllSessionIds();
        
        List<SessionInfoDTO> allSessions = sessionIds.stream()
            .map(this::toSessionInfo)
            .sorted((s1, s2) -> {
                if (s1.getLastMessageAt() == null) return 1;
                if (s2.getLastMessageAt() == null) return -1;
                return s2.getLastMessageAt().compareTo(s1.getLastMessageAt());
            })
            .collect(Collectors.toList());
        
        int start = Math.min(offset, allSessions.size());
        int end = Math.min(offset + limit, allSessions.size());
        
        if (start >= allSessions.size()) {
            return List.of();
        }
        
        return allSessions.subList(start, end);
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
    
    public String duplicateSession(String sessionId) {
        List<ChatMessage> messages = repository.findBySessionIdOrderByCreatedAtAsc(sessionId);
        
        if (messages.isEmpty()) {
            return null;
        }
        
        String newSessionId = UUID.randomUUID().toString();
        
        for (ChatMessage originalMessage : messages) {
            ChatMessage newMessage = new ChatMessage();
            newMessage.setSessionId(newSessionId);
            newMessage.setRole(originalMessage.getRole());
            newMessage.setContent(originalMessage.getContent());
            newMessage.setModel(originalMessage.getModel());
            newMessage.setPromptTokens(originalMessage.getPromptTokens());
            newMessage.setCompletionTokens(originalMessage.getCompletionTokens());
            newMessage.setTotalTokens(originalMessage.getTotalTokens());
            newMessage.setResponseTimeMs(originalMessage.getResponseTimeMs());
            newMessage.setProvider(originalMessage.getProvider());
            newMessage.setTemperature(originalMessage.getTemperature());
            newMessage.setMaxTokens(originalMessage.getMaxTokens());
            newMessage.setCreatedAt(originalMessage.getCreatedAt());
            repository.save(newMessage);
        }
        
        return newSessionId;
    }
    
    /**
     * Calculate cumulative token usage for a session.
     * Returns an array of [promptTokens, completionTokens, totalTokens].
     */
    public int[] getSessionTokenUsage(String sessionId) {
        List<ChatMessage> messages = repository.findBySessionIdOrderByCreatedAtAsc(sessionId);
        
        int totalPromptTokens = 0;
        int totalCompletionTokens = 0;
        int totalTokens = 0;
        
        for (ChatMessage message : messages) {
            if (message.getPromptTokens() != null) {
                totalPromptTokens += message.getPromptTokens();
            }
            if (message.getCompletionTokens() != null) {
                totalCompletionTokens += message.getCompletionTokens();
            }
            if (message.getTotalTokens() != null) {
                totalTokens += message.getTotalTokens();
            }
        }
        
        return new int[]{totalPromptTokens, totalCompletionTokens, totalTokens};
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
