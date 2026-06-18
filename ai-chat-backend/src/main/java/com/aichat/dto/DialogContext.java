package com.aichat.dto;

import java.time.Instant;
import java.util.List;

/**
 * DTO for short-term dialog context.
 * Stores active conversation messages for quick retrieval.
 *
 * @param userId       user ID
 * @param messages     list of recent messages
 * @param createdAt    context creation timestamp
 * @param lastAccessed last access timestamp
 */
public record DialogContext(
        Long userId,
        List<ChatMessageDTO> messages,
        Instant createdAt,
        Instant lastAccessed
) {
}
