package com.aichat.dto.rerank;

import java.util.List;

/**
 * Request DTO for TEI reranking API.
 * Matches the HuggingFace Text Embeddings Interface (TEI) rerank endpoint format.
 */
public class RerankRequest {
    private String query;
    private List<String> texts;
    private Integer topN;

    public RerankRequest() {
        // Default constructor for JSON deserialization
    }

    public RerankRequest(String query, List<String> texts, Integer topN) {
        this.query = query;
        this.texts = texts;
        this.topN = topN;
    }

    public String getQuery() {
        return query;
    }

    public void setQuery(String query) {
        this.query = query;
    }

    public List<String> getTexts() {
        return texts;
    }

    public void setTexts(List<String> texts) {
        this.texts = texts;
    }

    public Integer getTopN() {
        return topN;
    }

    public void setTopN(Integer topN) {
        this.topN = topN;
    }
}
