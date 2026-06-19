package com.aichat.service;

import com.aichat.dto.StickyFactDTO;
import com.aichat.entity.StickyFact;
import com.aichat.repository.StickyFactRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

@Service
@Transactional
public class StickyFactService {

    private final StickyFactRepository repository;
    
    // Track message counts per session for auto-extraction throttling
    private static final Map<String, AtomicInteger> messageCounters = new ConcurrentHashMap<>();

    public StickyFactService(StickyFactRepository repository) {
        this.repository = repository;
    }
    
    /**
     * Increment message counter for session and return the new count.
     * Used by StickyFactsContextStrategy to throttle auto-extraction.
     */
    public int incrementMessageCount(String sessionId) {
        AtomicInteger counter = messageCounters.computeIfAbsent(sessionId, k -> new AtomicInteger(0));
        return counter.incrementAndGet();
    }
    
    /**
     * Get current message count for session without incrementing.
     */
    public int getMessageCount(String sessionId) {
        AtomicInteger counter = messageCounters.get(sessionId);
        return counter != null ? counter.get() : 0;
    }

    public List<StickyFactDTO> getFacts(String sessionId) {
        return repository.findBySessionIdOrderByFactKeyAsc(sessionId)
                .stream()
                .map(this::toDTO)
                .collect(Collectors.toList());
    }

    /**
     * Get sticky facts as entities (for internal use by PromptBuilder).
     * @param sessionId session ID
     * @return list of StickyFact entities
     */
    public List<StickyFact> getFactsAsEntities(String sessionId) {
        return repository.findBySessionIdOrderByFactKeyAsc(sessionId)
                .stream()
                .collect(Collectors.toList());
    }

    public Map<String, String> getFactsAsMap(String sessionId) {
        return repository.findBySessionIdOrderByFactKeyAsc(sessionId)
                .stream()
                .collect(Collectors.toMap(StickyFact::getFactKey, StickyFact::getFactValue, (a, b) -> a));
    }

    public StickyFactDTO saveFact(String sessionId, String factKey, String factValue) {
        return saveFact(sessionId, factKey, factValue, false);
    }

    public StickyFactDTO saveFact(String sessionId, String factKey, String factValue, boolean isAutoExtracted) {
        Optional<StickyFact> existing = repository.findBySessionIdAndFactKey(sessionId, factKey);
        StickyFact fact = existing.orElseGet(() -> {
            StickyFact f = new StickyFact();
            f.setSessionId(sessionId);
            f.setFactKey(factKey);
            f.setCreatedAt(Instant.now());
            f.setAutoExtracted(isAutoExtracted);
            return f;
        });
        fact.setFactValue(factValue);
        fact.setUpdatedAt(Instant.now());
        // If user manually saves a fact that was auto-extracted, convert it to manual
        if (!isAutoExtracted && fact.isAutoExtracted()) {
            fact.setAutoExtracted(false);
        }
        return toDTO(repository.save(fact));
    }

    public void saveFacts(String sessionId, Map<String, String> facts) {
        saveFacts(sessionId, facts, false);
    }

    public void saveFacts(String sessionId, Map<String, String> facts, boolean isAutoExtracted) {
        if (facts == null) {
            return;
        }
        for (Map.Entry<String, String> entry : facts.entrySet()) {
            saveFact(sessionId, entry.getKey(), entry.getValue(), isAutoExtracted);
        }
    }

    public void saveAutoExtractedFacts(String sessionId, Map<String, String> facts) {
        saveFacts(sessionId, facts, true);
    }

    public void deleteFact(String sessionId, String factKey) {
        repository.deleteBySessionIdAndFactKey(sessionId, factKey);
    }

    public void deleteFactsBySession(String sessionId) {
        repository.deleteBySessionId(sessionId);
    }

    private StickyFactDTO toDTO(StickyFact entity) {
        StickyFactDTO dto = new StickyFactDTO();
        dto.setId(entity.getId());
        dto.setSessionId(entity.getSessionId());
        dto.setFactKey(entity.getFactKey());
        dto.setFactValue(entity.getFactValue());
        dto.setCreatedAt(entity.getCreatedAt());
        dto.setUpdatedAt(entity.getUpdatedAt());
        dto.setAutoExtracted(entity.isAutoExtracted());
        return dto;
    }
}
