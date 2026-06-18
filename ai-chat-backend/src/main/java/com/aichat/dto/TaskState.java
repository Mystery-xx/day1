package com.aichat.dto;

import java.time.Instant;
import java.util.Map;

/**
 * DTO for working memory task state.
 * Stores task execution state for debugging and recovery.
 *
 * @param userId     user ID
 * @param taskId     task ID
 * @param state      task state (CREATED, IN_PROGRESS, COMPLETED, FAILED)
 * @param data       task-specific data as JSON-like map
 * @param createdAt  creation timestamp
 * @param updatedAt  last update timestamp
 */
public record TaskState(
        Long userId,
        String taskId,
        String state,
        Map<String, Object> data,
        Instant createdAt,
        Instant updatedAt
) {
}
