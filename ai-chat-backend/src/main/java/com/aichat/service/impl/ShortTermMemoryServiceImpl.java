package com.aichat.service.impl;

import com.aichat.dto.DialogContext;
import com.aichat.service.MemoryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.CachePut;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

/**
 * Implementation of MemoryService for short-term dialog memory.
 * Uses Caffeine cache with 30-minute TTL and 1000 entry limit.
 */
@Service
public class ShortTermMemoryServiceImpl implements MemoryService {

    private static final Logger log = LoggerFactory.getLogger(ShortTermMemoryServiceImpl.class);

    /**
     * Get dialog context from short-term cache.
     *
     * @param userId user ID
     * @return Mono emitting dialog context or empty
     */
    @Override
    @Cacheable(cacheNames = "short-term-dialog", key = "#userId", unless = "#result == null")
    public Mono<DialogContext> getDialogContext(Long userId) {
        log.debug("Getting dialog context for user {}", userId);
        // Return empty - actual caching handled by @Cacheable
        return Mono.empty();
    }

    /**
     * Set dialog context in short-term cache.
     *
     * @param userId  user ID
     * @param context dialog context to cache
     * @return Mono emitting saved context
     */
    @Override
    @CachePut(cacheNames = "short-term-dialog", key = "#userId")
    public Mono<DialogContext> setDialogContext(Long userId, DialogContext context) {
        log.debug("Setting dialog context for user {}", userId);
        return Mono.just(context);
    }

    // Working memory methods - not implemented in this service
    @Override
    public Mono<com.aichat.dto.TaskState> getTaskState(Long userId, String taskId) {
        return Mono.error(new UnsupportedOperationException("Working memory not implemented in ShortTermMemoryService"));
    }

    @Override
    public Mono<com.aichat.dto.TaskState> saveTaskState(Long userId, com.aichat.dto.TaskState taskState) {
        return Mono.error(new UnsupportedOperationException("Working memory not implemented in ShortTermMemoryService"));
    }

    // Long-term memory methods - not implemented in this service
    @Override
    public reactor.core.publisher.Flux<com.aichat.dto.ArchitecturalDecisionDTO> getArchitecturalDecisions(Long userId) {
        return reactor.core.publisher.Flux.error(new UnsupportedOperationException("Long-term memory not implemented in ShortTermMemoryService"));
    }

    @Override
    public Mono<com.aichat.dto.ArchitecturalDecisionDTO> saveArchitecturalDecision(com.aichat.dto.ArchitecturalDecisionDTO decision) {
        return Mono.error(new UnsupportedOperationException("Long-term memory not implemented in ShortTermMemoryService"));
    }

    @Override
    public reactor.core.publisher.Flux<com.aichat.dto.DomainKnowledgeDTO> getDomainKnowledge(Long userId) {
        return reactor.core.publisher.Flux.error(new UnsupportedOperationException("Long-term memory not implemented in ShortTermMemoryService"));
    }

    @Override
    public Mono<com.aichat.dto.DomainKnowledgeDTO> saveDomainKnowledge(com.aichat.dto.DomainKnowledgeDTO knowledge) {
        return Mono.error(new UnsupportedOperationException("Long-term memory not implemented in ShortTermMemoryService"));
    }
}
