package com.aichat.service.codereview;

import java.util.List;

/**
 * Context for a code review request, representing a PR diff to be analyzed.
 */
public class DiffContext {
    private String unifiedDiff;
    private List<FileChange> changedFiles;
    private int prNumber;
    private String repo;
    private String commitSha;
    private String ragContext;

    public DiffContext() {
    }

    public DiffContext(String unifiedDiff, List<FileChange> changedFiles,
                       int prNumber, String repo, String commitSha) {
        this.unifiedDiff = unifiedDiff;
        this.changedFiles = changedFiles;
        this.prNumber = prNumber;
        this.repo = repo;
        this.commitSha = commitSha;
    }

    public String getUnifiedDiff() {
        return unifiedDiff;
    }

    public void setUnifiedDiff(String unifiedDiff) {
        this.unifiedDiff = unifiedDiff;
    }

    public List<FileChange> getChangedFiles() {
        return changedFiles;
    }

    public void setChangedFiles(List<FileChange> changedFiles) {
        this.changedFiles = changedFiles;
    }

    public int getPrNumber() {
        return prNumber;
    }

    public void setPrNumber(int prNumber) {
        this.prNumber = prNumber;
    }

    public String getRepo() {
        return repo;
    }

    public void setRepo(String repo) {
        this.repo = repo;
    }

    public String getCommitSha() {
        return commitSha;
    }

    public void setCommitSha(String commitSha) {
        this.commitSha = commitSha;
    }

    public String getRagContext() {
        return ragContext;
    }

    public void setRagContext(String ragContext) {
        this.ragContext = ragContext;
    }
}
