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

    /** Chunk index (0-based). Set to 0 for single-chunk (non-chunked) requests. */
    private int chunkIndex;
    /** Total number of chunks. Set to 1 for single-chunk (non-chunked) requests. */
    private int totalChunks;
    /** Whether this is the last chunk. True for single-chunk requests. */
    private boolean isLastChunk;

    public DiffContext() {
        this.chunkIndex = 0;
        this.totalChunks = 1;
        this.isLastChunk = true;
    }

    public DiffContext(String unifiedDiff, List<FileChange> changedFiles,
                       int prNumber, String repo, String commitSha) {
        this.unifiedDiff = unifiedDiff;
        this.changedFiles = changedFiles;
        this.prNumber = prNumber;
        this.repo = repo;
        this.commitSha = commitSha;
        this.chunkIndex = 0;
        this.totalChunks = 1;
        this.isLastChunk = true;
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

    public int getChunkIndex() {
        return chunkIndex;
    }

    public void setChunkIndex(int chunkIndex) {
        this.chunkIndex = chunkIndex;
    }

    public int getTotalChunks() {
        return totalChunks;
    }

    public void setTotalChunks(int totalChunks) {
        this.totalChunks = totalChunks;
    }

    public boolean isLastChunk() {
        return isLastChunk;
    }

    public void setLastChunk(boolean lastChunk) {
        isLastChunk = lastChunk;
    }
}
