package com.aichat.dto;

/**
 * DTO representing the result of a RAG indexing operation.
 */
public class IndexResult {
    private String documentId;
    private int chunkCount;
    private String status;
    private String errorMessage;
    
    public IndexResult() {
    }
    
    public IndexResult(String documentId, int chunkCount, String status) {
        this.documentId = documentId;
        this.chunkCount = chunkCount;
        this.status = status;
    }
    
    public static IndexResult success(String documentId, int chunkCount) {
        return new IndexResult(documentId, chunkCount, "SUCCESS");
    }
    
    public static IndexResult failure(String documentId, String errorMessage) {
        IndexResult result = new IndexResult(documentId, 0, "FAILED");
        result.setErrorMessage(errorMessage);
        return result;
    }
    
    public String getDocumentId() {
        return documentId;
    }
    
    public void setDocumentId(String documentId) {
        this.documentId = documentId;
    }
    
    public int getChunkCount() {
        return chunkCount;
    }
    
    public void setChunkCount(int chunkCount) {
        this.chunkCount = chunkCount;
    }
    
    public String getStatus() {
        return status;
    }
    
    public void setStatus(String status) {
        this.status = status;
    }
    
    public String getErrorMessage() {
        return errorMessage;
    }
    
    public void setErrorMessage(String errorMessage) {
        this.errorMessage = errorMessage;
    }
}
