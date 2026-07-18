package com.aichat.dto.rag;

import com.aichat.service.chunking.ChunkingType;

/**
 * Response DTO for file upload operation.
 */
public class UploadResponse {
    private String documentId;
    private int chunkCount;
    private String strategy;
    private String status;

    public UploadResponse() {
    }

    public UploadResponse(String documentId, int chunkCount, ChunkingType strategy, String status) {
        this.documentId = documentId;
        this.chunkCount = chunkCount;
        this.strategy = strategy != null ? strategy.name() : null;
        this.status = status;
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

    public String getStrategy() {
        return strategy;
    }

    public void setStrategy(String strategy) {
        this.strategy = strategy;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public static UploadResponse success(String documentId, int chunkCount, ChunkingType strategy) {
        return new UploadResponse(documentId, chunkCount, strategy, "success");
    }

    public static UploadResponse error(String documentId, String errorMessage) {
        UploadResponse response = new UploadResponse();
        response.setDocumentId(documentId);
        response.setStatus("error");
        return response;
    }
}
