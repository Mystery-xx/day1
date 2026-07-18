package com.aichat.context;

public enum ContextStrategyType {
    SUMMARY,
    SLIDING_WINDOW,
    STICKY_FACTS;

    public static ContextStrategyType fromString(String value) {
        if (value == null || value.isBlank()) {
            return SUMMARY;
        }
        String normalized = value.replaceAll("([a-z])([A-Z])", "$1_$2").toUpperCase().replace("-", "_");
        try {
            return valueOf(normalized);
        } catch (IllegalArgumentException e) {
            return SUMMARY;
        }
    }
}
