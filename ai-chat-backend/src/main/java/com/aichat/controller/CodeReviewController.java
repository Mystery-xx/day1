package com.aichat.controller;

import com.aichat.config.AiChatProperties;
import com.aichat.service.codereview.CodeReviewOrchestratorService;
import com.aichat.service.codereview.DiffContext;
import com.aichat.service.codereview.ReviewResult;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * REST controller for AI-powered code review operations.
 * 
 * Endpoints:
 * - POST /api/code-review/analyze - Run full code review on a PR diff
 * - GET /api/code-review/health - Health check with circuit breaker status
 */
@RestController
@RequestMapping("/api/code-review")
@CrossOrigin(originPatterns = "*", allowCredentials = "true")
// Note: @CrossOrigin("*") without patterns would conflict with global WebConfig allowCredentials=true
// Using originPatterns instead to allow credentials with wildcard origins
@Tag(name = "Code Review", description = "AI-powered code review API for GitHub PRs")
public class CodeReviewController {

    private static final Logger logger = LoggerFactory.getLogger(CodeReviewController.class);

    private final CodeReviewOrchestratorService orchestrator;
    private final AiChatProperties properties;

    /** Maximum diff size in characters (~2500 tokens / 4 chars per token) */
    private static final int MAX_DIFF_SIZE = 10000;

    /** Maximum total tokens budget across all agents */
    private static final int MAX_TOTAL_TOKENS = 10000;

    public CodeReviewController(CodeReviewOrchestratorService orchestrator,
                                AiChatProperties properties) {
        this.orchestrator = orchestrator;
        this.properties = properties;
    }

    /**
     * Run a full AI code review on the provided PR diff.
     * All 4 sub-agents run in parallel with resilience patterns.
     */
    @PostMapping("/analyze")
    @Operation(
        summary = "Run AI code review on PR diff",
        description = "Analyzes a PR diff using 4 parallel AI sub-agents (Bug Hunter, Architecture, Security, Style) " +
            "and returns aggregated findings with severity counts, token usage, and partial success indicators."
    )
    @ApiResponse(responseCode = "200", description = "Review completed (may be partial)")
    @ApiResponse(responseCode = "400", description = "Invalid input - missing diff or too large")
    @ApiResponse(responseCode = "500", description = "Internal server error - all agents failed")
    public ResponseEntity<?> analyze(@RequestBody DiffContext context) {
        logger.info("Received code review request for PR #{}", context.getPrNumber());

        // Validate input
        String validationError = validateInput(context);
        if (validationError != null) {
            logger.warn("Input validation failed: {}", validationError);
            Map<String, Object> error = new HashMap<>();
            error.put("error", validationError);
            return ResponseEntity.badRequest().body(error);
        }

        try {
            ReviewResult result = orchestrator.analyze(context);

            // Check if all agents failed
            if (result.getFailedAgents().size() >= 4) {
                logger.error("All 4 agents failed for PR #{}", context.getPrNumber());
                Map<String, Object> error = new HashMap<>();
                error.put("error", "All review agents failed");
                error.put("failedAgents", result.getFailedAgents());
                return ResponseEntity.internalServerError().body(error);
            }

            logger.info("Review result for PR #{}: {} findings, {} agents failed, {}ms",
                    context.getPrNumber(), result.getFindings().size(),
                    result.getFailedAgents().size(), result.getReviewTimeMs());

            return ResponseEntity.ok(result);

        } catch (Exception e) {
            logger.error("Unexpected error during code review for PR #{}: {}", context.getPrNumber(), e.getMessage());
            Map<String, Object> error = new HashMap<>();
            error.put("error", "Code review failed: " + e.getMessage());
            return ResponseEntity.internalServerError().body(error);
        }
    }

    /**
     * Health check endpoint for the code review service.
     * Returns AI API status, circuit breaker states, and overall health.
     */
    @GetMapping("/health")
    @Operation(
        summary = "Code Review service health check",
        description = "Returns health status including AI API connectivity and circuit breaker states."
    )
    public ResponseEntity<Map<String, Object>> health() {
        Map<String, Object> status = new HashMap<>();

        // AI API status (basic check)
        String aiApiStatus;
        try {
            aiApiStatus = (properties.getKey() != null && !properties.getKey().isBlank()
                    && properties.getUrl() != null && !properties.getUrl().isBlank())
                    ? "UP" : "DOWN";
        } catch (Exception e) {
            aiApiStatus = "DOWN";
        }

        // Circuit breaker states
        String bugHunterCb = orchestrator.getCircuitBreakerState("bug-hunter").name();
        String archCb = orchestrator.getCircuitBreakerState("architecture-reviewer").name();
        String secCb = orchestrator.getCircuitBreakerState("security-checker").name();
        String styleCb = orchestrator.getCircuitBreakerState("style-guide").name();

        boolean allCbClosed = "CLOSED".equals(bugHunterCb) && "CLOSED".equals(archCb)
                && "CLOSED".equals(secCb) && "CLOSED".equals(styleCb);

        String overallStatus = "UP";
        if ("DOWN".equals(aiApiStatus)) {
            overallStatus = "DOWN";
        } else if (!allCbClosed) {
            overallStatus = "DEGRADED";
        }

        status.put("status", overallStatus);
        status.put("aiApiStatus", aiApiStatus);
        status.put("circuitBreakers", Map.of(
                "bug-hunter", bugHunterCb,
                "architecture-reviewer", archCb,
                "security-checker", secCb,
                "style-guide", styleCb
        ));
        status.put("model", properties.getModel());
        status.put("maxTotalTokens", MAX_TOTAL_TOKENS);

        return ResponseEntity.ok(status);
    }

    /**
     * Validate the incoming DiffContext.
     */
    private String validateInput(DiffContext context) {
        if (context == null) {
            return "Request body is required";
        }
        if (context.getUnifiedDiff() == null || context.getUnifiedDiff().isBlank()) {
            return "unifiedDiff is required";
        }
        if (context.getUnifiedDiff().length() > MAX_DIFF_SIZE) {
            return "Diff too large: " + context.getUnifiedDiff().length()
                    + " chars (max " + MAX_DIFF_SIZE + ")";
        }
        if (context.getPrNumber() <= 0) {
            return "prNumber must be positive";
        }
        // Token budget enforcement: estimate tokens from diff size
        int estimatedTokens = context.getUnifiedDiff().length() / 4;
        if (estimatedTokens > MAX_TOTAL_TOKENS) {
            return "Diff would exceed token budget: estimated "
                    + estimatedTokens + " tokens (max " + MAX_TOTAL_TOKENS + ")";
        }
        return null;
    }
}
