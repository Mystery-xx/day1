package com.aichat.dto;

import java.util.List;

/**
 * Result of validation performed by ValidationAgent.
 * Contains validation status and optional list of issues.
 */
public enum ValidationResult {
    OK,
    FAILED
}
