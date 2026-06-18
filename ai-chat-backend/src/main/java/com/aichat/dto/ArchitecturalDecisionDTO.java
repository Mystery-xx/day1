package com.aichat.dto;

import java.time.Instant;

/**
 * DTO for architectural decision long-term memory.
 *
 * @param id          decision ID
 * @param userId      user ID
 * @param title       decision title
 * @param description decision description
 * @param rationale   decision rationale
 * @param createdAt   creation timestamp
 * @param updatedAt   last update timestamp
 */
public record ArchitecturalDecisionDTO(
        Long id,
        Long userId,
        String title,
        String description,
        String rationale,
        Instant createdAt,
        Instant updatedAt
) {
}
