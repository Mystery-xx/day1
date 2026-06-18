package com.aichat.dto;

import java.time.Instant;

/**
 * DTO for domain knowledge long-term memory.
 *
 * @param id        knowledge ID
 * @param userId    user ID
 * @param topic     knowledge topic
 * @param content   knowledge content
 * @param source    knowledge source
 * @param confidence confidence score (0.0-1.0)
 * @param createdAt creation timestamp
 * @param updatedAt last update timestamp
 */
public record DomainKnowledgeDTO(
        Long id,
        Long userId,
        String topic,
        String content,
        String source,
        Double confidence,
        Instant createdAt,
        Instant updatedAt
) {
}
