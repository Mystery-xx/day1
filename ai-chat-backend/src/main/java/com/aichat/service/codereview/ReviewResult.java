package com.aichat.service.codereview;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Aggregated result of a code review, combining findings from all sub-agents.
 */
public class ReviewResult {
    private List<Finding> findings;
    private Map<Severity, Integer> severityCounts;
    private int tokenUsage;
    private long reviewTimeMs;
    private boolean partialSuccess;
    private List<String> failedAgents;

    public ReviewResult() {
        this.findings = new ArrayList<>();
        this.severityCounts = new HashMap<>();
        this.failedAgents = new ArrayList<>();
        this.partialSuccess = false;
    }

    public ReviewResult(List<Finding> findings, int tokenUsage, long reviewTimeMs) {
        this.findings = findings;
        this.severityCounts = new HashMap<>();
        this.tokenUsage = tokenUsage;
        this.reviewTimeMs = reviewTimeMs;
        this.partialSuccess = false;
        this.failedAgents = new ArrayList<>();
        countSeverities();
    }

    public List<Finding> getFindings() {
        return findings;
    }

    public void setFindings(List<Finding> findings) {
        this.findings = findings;
        countSeverities();
    }

    public Map<Severity, Integer> getSeverityCounts() {
        return severityCounts;
    }

    public void setSeverityCounts(Map<Severity, Integer> severityCounts) {
        this.severityCounts = severityCounts;
    }

    public int getTokenUsage() {
        return tokenUsage;
    }

    public void setTokenUsage(int tokenUsage) {
        this.tokenUsage = tokenUsage;
    }

    public long getReviewTimeMs() {
        return reviewTimeMs;
    }

    public void setReviewTimeMs(long reviewTimeMs) {
        this.reviewTimeMs = reviewTimeMs;
    }

    public boolean isPartialSuccess() {
        return partialSuccess;
    }

    public void setPartialSuccess(boolean partialSuccess) {
        this.partialSuccess = partialSuccess;
    }

    public List<String> getFailedAgents() {
        return failedAgents;
    }

    public void setFailedAgents(List<String> failedAgents) {
        this.failedAgents = failedAgents;
    }

    public void addFinding(Finding finding) {
        if (this.findings == null) {
            this.findings = new ArrayList<>();
        }
        this.findings.add(finding);
    }

    public void addFailedAgent(String agentName) {
        if (this.failedAgents == null) {
            this.failedAgents = new ArrayList<>();
        }
        this.failedAgents.add(agentName);
    }

    private void countSeverities() {
        if (severityCounts == null) {
            severityCounts = new HashMap<>();
        }
        severityCounts.clear();
        if (findings != null) {
            for (Finding f : findings) {
                Severity s = f.getSeverity();
                severityCounts.merge(s, 1, Integer::sum);
            }
        }
    }

    /**
     * Merge multiple ReviewResult objects into a single aggregated result.
     * Combines findings, token usage, review time, and failed agents.
     * Re-computes severityCounts from the merged findings.
     */
    public static ReviewResult merge(List<ReviewResult> results) {
        ReviewResult merged = new ReviewResult();
        if (results == null || results.isEmpty()) {
            return merged;
        }

        List<Finding> allFindings = new ArrayList<>();
        int totalTokenUsage = 0;
        long totalReviewTimeMs = 0;
        List<String> allFailedAgents = new ArrayList<>();

        for (ReviewResult r : results) {
            if (r == null) continue;
            if (r.getFindings() != null) {
                allFindings.addAll(r.getFindings());
            }
            totalTokenUsage += r.getTokenUsage();
            totalReviewTimeMs += r.getReviewTimeMs();
            if (r.getFailedAgents() != null) {
                allFailedAgents.addAll(r.getFailedAgents());
            }
        }

        merged.setFindings(allFindings);
        merged.setTokenUsage(totalTokenUsage);
        merged.setReviewTimeMs(totalReviewTimeMs);
        merged.setFailedAgents(allFailedAgents);
        merged.setPartialSuccess(!allFailedAgents.isEmpty());

        return merged;
    }
}
