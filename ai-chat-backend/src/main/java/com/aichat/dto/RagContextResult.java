package com.aichat.dto;

import java.util.List;

/**
 * DTO representing the result of a RAG search and augmentation operation.
 * Contains formatted context for LLM and list of sources used.
 */
public class RagContextResult {
    private String context;
    private List<SourceInfo> sources;
    private List<Double> rerankScores;
    private boolean queryWasRewritten;
    
    public RagContextResult() {
    }
    
    public RagContextResult(String context, List<SourceInfo> sources) {
        this.context = context;
        this.sources = sources;
        this.queryWasRewritten = false;
    }
    
    public RagContextResult(String context, List<SourceInfo> sources, List<Double> rerankScores, boolean queryWasRewritten) {
        this.context = context;
        this.sources = sources;
        this.rerankScores = rerankScores;
        this.queryWasRewritten = queryWasRewritten;
    }
    
    public String getContext() {
        return context;
    }
    
    public void setContext(String context) {
        this.context = context;
    }
    
    public List<SourceInfo> getSources() {
        return sources;
    }
    
    public void setSources(List<SourceInfo> sources) {
        this.sources = sources;
    }
    
    public List<Double> getRerankScores() {
        return rerankScores;
    }
    
    public void setRerankScores(List<Double> rerankScores) {
        this.rerankScores = rerankScores;
    }
    
    public boolean isQueryWasRewritten() {
        return queryWasRewritten;
    }
    
    public void setQueryWasRewritten(boolean queryWasRewritten) {
        this.queryWasRewritten = queryWasRewritten;
    }
}
