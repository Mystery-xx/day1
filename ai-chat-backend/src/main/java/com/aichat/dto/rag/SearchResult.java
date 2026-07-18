package com.aichat.dto.rag;

import java.util.Map;

/**
 * DTO representing a single search result from vector similarity search.
 */
public class SearchResult {
    private String chunkId;
    private String content;
    private double similarity;
    private Map<String, Object> metadata;

    public SearchResult() {
    }

    public SearchResult(String chunkId, String content, double similarity, Map<String, Object> metadata) {
        this.chunkId = chunkId;
        this.content = content;
        this.similarity = similarity;
        this.metadata = metadata;
    }

    public String getChunkId() {
        return chunkId;
    }

    public void setChunkId(String chunkId) {
        this.chunkId = chunkId;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public double getSimilarity() {
        return similarity;
    }

    public void setSimilarity(double similarity) {
        this.similarity = similarity;
    }

    public Map<String, Object> getMetadata() {
        return metadata;
    }

    public void setMetadata(Map<String, Object> metadata) {
        this.metadata = metadata;
    }

    public static SearchResult of(String chunkId, String content, double similarity, Map<String, Object> metadata) {
        return new SearchResult(chunkId, content, similarity, metadata);
    }
}
