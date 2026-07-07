package com.aichat.dto.rerank;

/**
 * Internal DTO representing a document after reranking.
 * Contains the original document text and its relevance score.
 */
public class RerankedDocument {
    private String text;
    private Double score;
    private Integer originalIndex;

    public RerankedDocument() {
        // Default constructor
    }

    public RerankedDocument(String text, Double score, Integer originalIndex) {
        this.text = text;
        this.score = score;
        this.originalIndex = originalIndex;
    }

    public String getText() {
        return text;
    }

    public void setText(String text) {
        this.text = text;
    }

    public Double getScore() {
        return score;
    }

    public void setScore(Double score) {
        this.score = score;
    }

    public Integer getOriginalIndex() {
        return originalIndex;
    }

    public void setOriginalIndex(Integer originalIndex) {
        this.originalIndex = originalIndex;
    }

    /**
     * Static factory method for cleaner instantiation.
     */
    public static RerankedDocument of(String text, Double score, Integer originalIndex) {
        return new RerankedDocument(text, score, originalIndex);
    }
}
