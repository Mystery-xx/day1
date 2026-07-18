package com.aichat.service.codereview;

import com.google.common.util.concurrent.ThreadFactoryBuilder;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.*;
import java.util.function.Supplier;

/**
 * Orchestrates parallel execution of all 4 code review sub-agents with resilience patterns.
 * 
 * Features:
 * - Dedicated ExecutorService (NOT common pool)
 * - Per-agent timeout: 2 minutes
 * - Overall timeout: 5 minutes
 * - Circuit breaker per agent (Resilience4j)
 * - Partial result aggregation
 */
@Service
public class CodeReviewOrchestratorService {

    private static final Logger logger = LoggerFactory.getLogger(CodeReviewOrchestratorService.class);

    private final BugHunterService bugHunterService;
    private final ArchitectureReviewerService architectureReviewerService;
    private final SecurityCheckerService securityCheckerService;
    private final StyleGuideService styleGuideService;

    private final ExecutorService agentExecutor;
    private final Map<String, CircuitBreaker> circuitBreakers;
    private final CircuitBreakerRegistry circuitBreakerRegistry;

    private static final int PER_AGENT_TIMEOUT_SECONDS = 120;  // 2 minutes
    private static final int OVERALL_TIMEOUT_SECONDS = 300;     // 5 minutes

    public CodeReviewOrchestratorService(
            BugHunterService bugHunterService,
            ArchitectureReviewerService architectureReviewerService,
            SecurityCheckerService securityCheckerService,
            StyleGuideService styleGuideService) {

        this.bugHunterService = bugHunterService;
        this.architectureReviewerService = architectureReviewerService;
        this.securityCheckerService = securityCheckerService;
        this.styleGuideService = styleGuideService;

        // Dedicated ExecutorService (NOT common pool)
        this.agentExecutor = Executors.newFixedThreadPool(8,
                new ThreadFactoryBuilder()
                        .setNameFormat("code-review-agent-%d")
                        .setDaemon(true)
                        .build());

        // Circuit breaker configuration
        CircuitBreakerConfig cbConfig = CircuitBreakerConfig.custom()
                .failureRateThreshold(50)
                .waitDurationInOpenState(Duration.ofSeconds(30))
                .permittedNumberOfCallsInHalfOpenState(3)
                .slidingWindowSize(10)
                .minimumNumberOfCalls(5)
                .build();

        this.circuitBreakerRegistry = CircuitBreakerRegistry.of(cbConfig);
        this.circuitBreakers = new ConcurrentHashMap<>();
    }

    /**
     * Run all 4 agents in parallel and aggregate results.
     *
     * @param context the PR diff context to analyze
     * @return aggregated ReviewResult with findings from all agents
     */
    public ReviewResult analyze(DiffContext context) {
        long overallStartTime = System.currentTimeMillis();

        logger.info("Starting code review for PR #{} with {} agents", context.getPrNumber(), 4);

        // Create async tasks for all 4 agents
        CompletableFuture<AgentTask> bugFuture = runAgentAsync("bug-hunter", () -> bugHunterService.review(context));
        CompletableFuture<AgentTask> archFuture = runAgentAsync("architecture-reviewer", () -> architectureReviewerService.review(context));
        CompletableFuture<AgentTask> secFuture = runAgentAsync("security-checker", () -> securityCheckerService.review(context));
        CompletableFuture<AgentTask> styleFuture = runAgentAsync("style-guide", () -> styleGuideService.review(context));

        // Wait for all tasks with overall timeout
        List<CompletableFuture<AgentTask>> allFutures = List.of(bugFuture, archFuture, secFuture, styleFuture);
        CompletableFuture<Void> allDone = CompletableFuture.allOf(allFutures.toArray(new CompletableFuture[0]));

        try {
            allDone.get(OVERALL_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (TimeoutException e) {
            logger.warn("Overall review timeout ({}s) reached - collecting partial results", OVERALL_TIMEOUT_SECONDS);
            // Cancel remaining futures
            allFutures.forEach(f -> f.cancel(true));
        } catch (Exception e) {
            logger.error("Error during parallel review execution: {}", e.getMessage());
        }

        // Aggregate results
        List<Finding> allFindings = new ArrayList<>();
        List<String> failedAgentsList = new ArrayList<>();
        int totalTokenUsage = 0;

        for (CompletableFuture<AgentTask> future : allFutures) {
            try {
                AgentTask task = future.get(1, TimeUnit.SECONDS); // Should be already complete
                if (task.result != null) {
                    allFindings.addAll(task.result.getFindings());
                    totalTokenUsage += task.result.getTokenUsage();
                } else {
                    failedAgentsList.add(task.agentName);
                    logger.warn("Agent '{}' returned no results", task.agentName);
                }
            } catch (Exception e) {
                // Find which agent this future belongs to
                String failedAgent = findAgentForFuture(future, allFutures);
                failedAgentsList.add(failedAgent);
                logger.warn("Agent '{}' failed to complete: {}", failedAgent, e.getMessage());
            }
        }

        long overallTimeMs = System.currentTimeMillis() - overallStartTime;
        ReviewResult aggregated = new ReviewResult();
        aggregated.setFindings(allFindings);
        aggregated.setFailedAgents(failedAgentsList);
        aggregated.setTokenUsage(totalTokenUsage);
        aggregated.setReviewTimeMs(overallTimeMs);
        aggregated.setPartialSuccess(!failedAgentsList.isEmpty());

        logger.info("Code review complete for PR #{}: {} findings from {} agents ({} failed) in {}ms",
                context.getPrNumber(), aggregated.getFindings().size(),
                4, aggregated.getFailedAgents().size(), overallTimeMs);

        return aggregated;
    }

    /**
     * Run a single agent asynchronously with circuit breaker protection.
     */
    private CompletableFuture<AgentTask> runAgentAsync(String agentName, Supplier<ReviewResult> agentCall) {
        return CompletableFuture.supplyAsync(() -> {
            CircuitBreaker cb = circuitBreakers.computeIfAbsent(agentName,
                    name -> circuitBreakerRegistry.circuitBreaker(name));

            // Execute with circuit breaker protection
            return cb.executeSupplier(() -> {
                logger.debug("Starting agent '{}'", agentName);
                long startTime = System.currentTimeMillis();
                try {
                    ReviewResult result = agentCall.get();
                    long elapsed = System.currentTimeMillis() - startTime;
                    logger.info("Agent '{}' completed in {}ms with {} findings",
                            agentName, elapsed, result != null ? result.getFindings().size() : 0);
                    return new AgentTask(agentName, result);
                } catch (Exception e) {
                    logger.error("Agent '{}' failed after {}ms: {}",
                            agentName, System.currentTimeMillis() - startTime, e.getMessage());
                    throw e;
                }
            });
        }, agentExecutor)
        .orTimeout(PER_AGENT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .exceptionally(throwable -> {
            logger.warn("Agent '{}' failed (circuit breaker state: {}): {}",
                    agentName,
                    circuitBreakers.getOrDefault(agentName, circuitBreakerRegistry.circuitBreaker(agentName)).getState(),
                    throwable.getMessage());
            return new AgentTask(agentName, null);
        });
    }

    /**
     * Get the state of the circuit breaker for a given agent.
     */
    public CircuitBreaker.State getCircuitBreakerState(String agentName) {
        CircuitBreaker cb = circuitBreakers.get(agentName);
        if (cb == null) {
            return CircuitBreaker.State.CLOSED;
        }
        return cb.getState();
    }

    /**
     * Check if all circuit breakers are healthy (CLOSED).
     */
    public boolean areAllCircuitBreakersClosed() {
        return circuitBreakers.values().stream()
                .allMatch(cb -> cb.getState() == CircuitBreaker.State.CLOSED);
    }

    /**
     * Get count of open circuit breakers.
     */
    public long getOpenCircuitBreakerCount() {
        return circuitBreakers.values().stream()
                .filter(cb -> cb.getState() == CircuitBreaker.State.OPEN)
                .count();
    }

    public void shutdown() {
        agentExecutor.shutdown();
        try {
            if (!agentExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
                agentExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            agentExecutor.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }

    // Helper class to pair agent name with result
    private static class AgentTask {
        final String agentName;
        final ReviewResult result;

        AgentTask(String agentName, ReviewResult result) {
            this.agentName = agentName;
            this.result = result;
        }
    }

    private String findAgentForFuture(CompletableFuture<AgentTask> future, List<CompletableFuture<AgentTask>> allFutures) {
        String[] agentNames = {"bug-hunter", "architecture-reviewer", "security-checker", "style-guide"};
        for (int i = 0; i < allFutures.size(); i++) {
            if (allFutures.get(i) == future && i < agentNames.length) {
                return agentNames[i];
            }
        }
        return "unknown";
    }
}
