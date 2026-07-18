package com.aichat.dto.rag;

import java.util.List;

/**
 * Response DTO for vector search operation.
 */
public class SearchResponse {
    private String query;
    private int topK;
    private List<SearchResult> results;

    public SearchResponse() {
    }

    public SearchResponse(String query, int topK, List<SearchResult> results) {
        this.query = query;
        this.topK = topK;
        this.results = results;
    }

    public String getQuery() {
        return query;
    }

    public void setQuery(String query) {
        this.query = query;
    }

    public int getTopK() {
        return topK;
    }

    public void setTopK(int topK) {
        this.topK = topK;
    }

    public List<SearchResult> getResults() {
        return results;
    }

    public void setResults(List<SearchResult> results) {
        this.results = results;
    }

    public static SearchResponse of(String query, int topK, List<SearchResult> results) {
        return new SearchResponse(query, topK, results);
    }
}
