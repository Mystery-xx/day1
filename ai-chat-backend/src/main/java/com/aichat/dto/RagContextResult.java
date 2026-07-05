package com.aichat.dto;

import java.util.List;

/**
 * DTO representing the result of a RAG search and augmentation operation.
 * Contains formatted context for LLM and list of sources used.
 */
public class RagContextResult {
    private String context;
    private List<SourceInfo> sources;
    
    public RagContextResult() {
    }
    
    public RagContextResult(String context, List<SourceInfo> sources) {
        this.context = context;
        this.sources = sources;
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
}
