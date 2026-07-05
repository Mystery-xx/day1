package com.aichat.dto;

/**
 * DTO representing information about a source document used in RAG context.
 */
public class SourceInfo {
    private String source;
    private String title;
    private String section;
    private double similarity;
    
    public SourceInfo() {
    }
    
    public SourceInfo(String source, String title, String section, double similarity) {
        this.source = source;
        this.title = title;
        this.section = section;
        this.similarity = similarity;
    }
    
    public String getSource() {
        return source;
    }
    
    public void setSource(String source) {
        this.source = source;
    }
    
    public String getTitle() {
        return title;
    }
    
    public void setTitle(String title) {
        this.title = title;
    }
    
    public String getSection() {
        return section;
    }
    
    public void setSection(String section) {
        this.section = section;
    }
    
    public double getSimilarity() {
        return similarity;
    }
    
    public void setSimilarity(double similarity) {
        this.similarity = similarity;
    }
}
