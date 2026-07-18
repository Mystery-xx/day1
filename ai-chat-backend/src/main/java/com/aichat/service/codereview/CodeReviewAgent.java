package com.aichat.service.codereview;

/**
 * Interface for AI-powered code review agents.
 * Each agent specializes in a specific review category (bugs, architecture, security, style).
 * 
 * Implementations must NOT extend AiChatService - they are independent agents
 * that use the AI API via WebClient for their specific task.
 */
public interface CodeReviewAgent {

    /**
     * Perform a code review on the given diff context.
     *
     * @param context the PR diff context to analyze
     * @return ReviewResult containing findings from this agent
     */
    ReviewResult review(DiffContext context);

    /**
     * Get the name of this agent (e.g., "bug-hunter", "architecture-reviewer").
     * Used for logging and metrics.
     */
    String agentName();

    /**
     * Get the maximum token budget for this agent's AI call.
     * @return max tokens allowed
     */
    default int maxTokens() {
        return 2500;
    }
}
