package com.aichat.service;

import com.aichat.dto.DialogContext;
import com.aichat.dto.TaskState;
import com.aichat.dto.ArchitecturalDecisionDTO;
import com.aichat.dto.DomainKnowledgeDTO;
import reactor.core.publisher.Mono;
import reactor.core.publisher.Flux;

/**
 * Service interface for 3-level memory model.
 * Provides explicit control over short-term, working, and long-term memory.
 */
public interface MemoryService {

    // ==================== Short-term Memory (Caffeine Cache) ====================

    /**
     * Get dialog context for user from short-term cache.
     *
     * @param userId user ID
     * @return Mono emitting dialog context or empty
     */
    Mono<DialogContext> getDialogContext(Long userId);

    /**
     * Set dialog context in short-term cache.
     *
     * @param userId  user ID
     * @param context dialog context to cache
     * @return Mono emitting saved context
     */
    Mono<DialogContext> setDialogContext(Long userId, DialogContext context);

    // ==================== Working Memory (SQLite + JSON) ====================

    /**
     * Get task state from working memory.
     *
     * @param userId user ID
     * @param taskId task ID
     * @return Mono emitting task state or empty
     */
    Mono<TaskState> getTaskState(Long userId, String taskId);

    /**
     * Save task state to working memory.
     *
     * @param userId    user ID
     * @param taskState task state to save
     * @return Mono emitting saved state
     */
    Mono<TaskState> saveTaskState(Long userId, TaskState taskState);

    // ==================== Long-term Memory (PostgreSQL) ====================

    /**
     * Get all architectural decisions for user.
     *
     * @param userId user ID
     * @return Flux emitting architectural decisions
     */
    Flux<ArchitecturalDecisionDTO> getArchitecturalDecisions(Long userId);

    /**
     * Save architectural decision.
     *
     * @param decision decision to save
     * @return Mono emitting saved decision
     */
    Mono<ArchitecturalDecisionDTO> saveArchitecturalDecision(ArchitecturalDecisionDTO decision);

    /**
     * Get all domain knowledge for user.
     *
     * @param userId user ID
     * @return Flux emitting domain knowledge
     */
    Flux<DomainKnowledgeDTO> getDomainKnowledge(Long userId);

    /**
     * Save domain knowledge.
     *
     * @param knowledge knowledge to save
     * @return Mono emitting saved knowledge
     */
    Mono<DomainKnowledgeDTO> saveDomainKnowledge(DomainKnowledgeDTO knowledge);
}
