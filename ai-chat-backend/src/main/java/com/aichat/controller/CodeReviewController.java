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

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
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

    /** Maximum diff size per chunk in characters (~2500 tokens / 4 chars per token) */
    private static final int MAX_DIFF_SIZE = 10000;

    /** Maximum total tokens budget across all agents */
    private static final int MAX_TOTAL_TOKENS = 10000;

    /** In-memory accumulator for chunked review results, keyed by "prNumber:repo" */
    private final Map<String, ChunkedReviewAccumulator> chunkAccumulators = new HashMap<>();

    public CodeReviewController(CodeReviewOrchestratorService orchestrator,
                                AiChatProperties properties) {
        this.orchestrator = orchestrator;
        this.properties = properties;
    }

    /**
     * Run a full AI code review on the provided PR diff (or a chunk of it).
     * Supports chunked processing: send chunks sequentially with chunkIndex/totalChunks/isLastChunk.
     * Results are aggregated from all chunks and returned only on the last chunk.
     */
    @PostMapping("/analyze")
    @Operation(
        summary = "Run AI code review on PR diff (supports chunked processing)",
        description = "Analyzes a PR diff using 4 parallel AI sub-agents (Bug Hunter, Architecture, Security, Style) " +
            "and returns aggregated findings with severity counts, token usage, and partial success indicators. " +
            "Supports chunked diff processing via chunkIndex/totalChunks/isLastChunk fields."
    )
    @ApiResponse(responseCode = "200", description = "Review completed (may be partial) - final result if isLastChunk, or intermediate acceptance")
    @ApiResponse(responseCode = "202", description = "Chunk accepted, waiting for more chunks")
    @ApiResponse(responseCode = "400", description = "Invalid input - missing diff or too large")
    @ApiResponse(responseCode = "500", description = "Internal server error - all agents failed")
    public ResponseEntity<?> analyze(@RequestBody DiffContext context) {
        logger.info("Received code review request for PR #{} chunk {}/{}",
                context.getPrNumber(), context.getChunkIndex() + 1, context.getTotalChunks());

        // Validate input
        String validationError = validateInput(context);
        if (validationError != null) {
            logger.warn("Input validation failed: {}", validationError);
            Map<String, Object> error = new HashMap<>();
            error.put("error", validationError);
            return ResponseEntity.badRequest().body(error);
        }

        try {
            ReviewResult chunkResult = orchestrator.analyze(context);
            String accumulatorKey = context.getPrNumber() + ":" + context.getRepo();

            if (context.getTotalChunks() <= 1) {
                // Single-chunk (non-chunked) request — return result directly
                return buildResponse(context, chunkResult);
            }

            // Chunked request — accumulate results
            ChunkedReviewAccumulator acc = chunkAccumulators
                    .computeIfAbsent(accumulatorKey, k -> new ChunkedReviewAccumulator(context.getTotalChunks()));

            acc.addChunkResult(context.getChunkIndex(), chunkResult);

            if (context.isLastChunk()) {
                // All chunks received — merge and return final result
                ReviewResult merged = acc.merge();
                chunkAccumulators.remove(accumulatorKey);
                logger.info("Merged review result for PR #{} from {} chunks: {} findings, {} agents failed, {}ms",
                        context.getPrNumber(), context.getTotalChunks(),
                        merged.getFindings().size(), merged.getFailedAgents().size(), merged.getReviewTimeMs());

                // Check if all agents failed
                if (merged.getFailedAgents().size() >= 4) {
                    logger.error("All 4 agents failed for PR #{}", context.getPrNumber());
                    Map<String, Object> error = new HashMap<>();
                    error.put("error", "All review agents failed");
                    error.put("failedAgents", merged.getFailedAgents());
                    return ResponseEntity.internalServerError().body(error);
                }

                return ResponseEntity.ok(merged);
            } else {
                // Intermediate chunk — acknowledge
                logger.info("Chunk {}/{} accepted for PR #{}, accumulated {} chunk results so far",
                        context.getChunkIndex() + 1, context.getTotalChunks(),
                        context.getPrNumber(), acc.getReceivedCount());
                return ResponseEntity.accepted().body(Map.of(
                        "status", "chunk_accepted",
                        "chunkIndex", context.getChunkIndex(),
                        "totalChunks", context.getTotalChunks(),
                        "receivedChunks", acc.getReceivedCount()
                ));
            }

        } catch (Exception e) {
            logger.error("Unexpected error during code review for PR #{}: {}", context.getPrNumber(), e.getMessage());
            Map<String, Object> error = new HashMap<>();
            error.put("error", "Code review failed: " + e.getMessage());
            return ResponseEntity.internalServerError().body(error);
        }
    }

    /**
     * Build a response entity from a single review result.
     */
    private ResponseEntity<?> buildResponse(DiffContext context, ReviewResult result) {
        if (result.getFailedAgents().size() >= 4) {
            Map<String, Object> error = new HashMap<>();
            error.put("error", "All review agents failed");
            error.put("failedAgents", result.getFailedAgents());
            return ResponseEntity.internalServerError().body(error);
        }
        return ResponseEntity.ok(result);
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
        if (context.getChunkIndex() < 0) {
            return "chunkIndex must be >= 0";
        }
        if (context.getTotalChunks() < 1) {
            return "totalChunks must be >= 1";
        }
        if (context.getChunkIndex() >= context.getTotalChunks()) {
            return "chunkIndex (" + context.getChunkIndex()
                    + ") must be < totalChunks (" + context.getTotalChunks() + ")";
        }
        // Token budget enforcement: estimate tokens from diff size
        int estimatedTokens = context.getUnifiedDiff().length() / 4;
        if (estimatedTokens > MAX_TOTAL_TOKENS) {
            return "Diff would exceed token budget: estimated "
                    + estimatedTokens + " tokens (max " + MAX_TOTAL_TOKENS + ")";
        }
        return null;
    }

    /**
     * In-memory accumulator for chunked review results.
     * Collects results from individual chunks and merges them when all chunks arrive.
     */
    private static class ChunkedReviewAccumulator {
        private final ReviewResult[] chunkResults;
        private int receivedCount;

        ChunkedReviewAccumulator(int totalChunks) {
            this.chunkResults = new ReviewResult[totalChunks];
            this.receivedCount = 0;
        }

        synchronized void addChunkResult(int chunkIndex, ReviewResult result) {
            if (chunkResults[chunkIndex] != null) {
                throw new IllegalStateException(
                        "Duplicate chunk result for index " + chunkIndex);
            }
            chunkResults[chunkIndex] = result;
            receivedCount++;
        }

        synchronized int getReceivedCount() {
            return receivedCount;
        }

        synchronized ReviewResult merge() {
            List<ReviewResult> nonNullResults = new ArrayList<>();
            for (ReviewResult r : chunkResults) {
                if (r != null) {
                    nonNullResults.add(r);
                }
            }
            return ReviewResult.merge(nonNullResults);
        }
    }
}
