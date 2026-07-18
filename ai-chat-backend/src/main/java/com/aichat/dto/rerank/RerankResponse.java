package com.aichat.dto.rerank;

import java.util.List;

/**
 * Response DTO for TEI reranking API.
 * Contains list of reranked results with index and relevance score.
 */
public class RerankResponse {
    private List<RerankResult> results;

    public RerankResponse() {
        // Default constructor for JSON deserialization
    }

    public RerankResponse(List<RerankResult> results) {
        this.results = results;
    }

    public List<RerankResult> getResults() {
        return results;
    }

    public void setResults(List<RerankResult> results) {
        this.results = results;
    }

    /**
     * Inner class representing a single rerank result.
     * Matches TEI reranking API response format: {"index": 0, "score": 0.9}
     */
    public static class RerankResult {
        private Integer index;
        private Double score;

        public RerankResult() {
            // Default constructor for JSON deserialization
        }

        public RerankResult(Integer index, Double score) {
            this.index = index;
            this.score = score;
        }

        public Integer getIndex() {
            return index;
        }

        public void setIndex(Integer index) {
            this.index = index;
        }

        public Double getScore() {
            return score;
        }

        public void setScore(Double score) {
            this.score = score;
        }

        // Keep relevanceScore as alias for backward compatibility
        public Double getRelevanceScore() {
            return score;
        }

        public void setRelevanceScore(Double relevanceScore) {
            this.score = relevanceScore;
        }
    }
}
