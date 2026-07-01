package com.aichat.controller;

import com.aichat.dto.IndexResult;
import com.aichat.dto.rag.SearchResponse;
import com.aichat.dto.rag.SearchResult;
import com.aichat.dto.rag.UploadResponse;
import com.aichat.service.RagIndexingService;
import com.aichat.service.chunking.ChunkingType;
import com.aichat.service.storage.VectorStorageService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * REST controller for RAG (Retrieval-Augmented Generation) operations.
 * Provides endpoints for document upload, vector search, and document deletion.
 */
@RestController
@RequestMapping("/api/rag")
@CrossOrigin(originPatterns = "*", allowCredentials = "true")
@Tag(name = "RAG", description = "Retrieval-Augmented Generation API - Document indexing and semantic search")
public class RagController {
    private static final Logger logger = LoggerFactory.getLogger(RagController.class);

    private final RagIndexingService indexingService;
    private final VectorStorageService storageService;

    public RagController(RagIndexingService indexingService, VectorStorageService storageService) {
        this.indexingService = indexingService;
        this.storageService = storageService;
    }

    /**
     * Upload a document for indexing.
     * The file is chunked, embedded, and stored for vector search.
     * 
     * @param file the document file to upload (max 10MB)
     * @param strategy chunking strategy (FIXED_SIZE or SEMANTIC, default: SEMANTIC)
     * @return upload result with document ID and chunk count
     */
    @PostMapping("/upload")
    @Operation(
        summary = "Upload document for indexing",
        description = "Upload a document (.txt or .md, max 10MB) for RAG indexing. " +
            "The document will be chunked using the specified strategy, embedded, and stored for vector search."
    )
    @ApiResponses(value = {
        @ApiResponse(
            responseCode = "200",
            description = "Document uploaded successfully",
            content = @Content(
                mediaType = "application/json",
                schema = @Schema(implementation = UploadResponse.class),
                examples = @ExampleObject(
                    name = "Success",
                    summary = "Successful upload",
                    value = """
                        {
                          "documentId": "test-md-1234567890",
                          "chunkCount": 5,
                          "strategy": "SEMANTIC",
                          "status": "success"
                        }
                        """
                )
            )
        ),
        @ApiResponse(
            responseCode = "400",
            description = "Bad request - invalid file type, file too large, or empty file",
            content = @Content(
                mediaType = "application/json",
                examples = @ExampleObject(
                    name = "Invalid file",
                    summary = "File validation failed",
                    value = """
                        {
                          "documentId": "unknown",
                          "status": "error"
                        }
                        """
                )
            )
        ),
        @ApiResponse(
            responseCode = "500",
            description = "Internal server error - embedding service unavailable or other error",
            content = @Content(
                mediaType = "application/json",
                examples = @ExampleObject(
                    name = "Server error",
                    summary = "Internal error during indexing",
                    value = """
                        {
                          "documentId": "test-md-1234567890",
                          "status": "error"
                        }
                        """
                )
            )
        )
    })
    public ResponseEntity<UploadResponse> upload(
            @Parameter(
                description = "Document file to upload (.txt or .md format, max 10MB)",
                required = true,
                content = @Content(
                    mediaType = "multipart/form-data",
                    schema = @Schema(type = "string", format = "binary")
                )
            )
            @RequestParam("file") MultipartFile file,
            @Parameter(
                description = "Chunking strategy: SEMANTIC (by headers) or FIXED_SIZE (by word count)",
                required = false,
                example = "SEMANTIC"
            )
            @RequestParam(value = "strategy", defaultValue = "SEMANTIC") ChunkingType strategy) {
        
        logger.info("Received file upload request: filename={}, size={}, strategy={}", 
            file.getOriginalFilename(), file.getSize(), strategy);

        try {
            IndexResult result = indexingService.index(file, strategy);
            
            if ("SUCCESS".equals(result.getStatus())) {
                UploadResponse response = UploadResponse.success(
                    result.getDocumentId(), 
                    result.getChunkCount(), 
                    strategy
                );
                
                logger.info("Successfully uploaded file '{}' with {} chunks", result.getDocumentId(), result.getChunkCount());
                return ResponseEntity.ok(response);
            } else {
                logger.warn("Indexing failed: {}", result.getErrorMessage());
                UploadResponse response = UploadResponse.error(
                    file.getOriginalFilename() != null ? file.getOriginalFilename() : "unknown",
                    result.getErrorMessage()
                );
                return ResponseEntity.badRequest().body(response);
            }
            
        } catch (Exception e) {
            logger.error("Unexpected error during file upload", e);
            UploadResponse response = UploadResponse.error(
                file.getOriginalFilename() != null ? file.getOriginalFilename() : "unknown",
                "Internal server error"
            );
            return ResponseEntity.internalServerError().body(response);
        }
    }

    /**
     * Search for similar document chunks using vector similarity.
     * 
     * @param query the search query
     * @param topK number of results to return (default: 10)
     * @return list of search results with similarity scores
     */
    @GetMapping("/search")
    @Operation(
        summary = "Search indexed documents",
        description = "Search for document chunks using semantic similarity. " +
            "Returns the top K most similar chunks based on vector embedding similarity."
    )
    @ApiResponses(value = {
        @ApiResponse(
            responseCode = "200",
            description = "Search results returned successfully",
            content = @Content(
                mediaType = "application/json",
                schema = @Schema(implementation = SearchResponse.class),
                examples = @ExampleObject(
                    name = "Success",
                    summary = "Search results",
                    value = """
                        {
                          "query": "weather api",
                          "topK": 5,
                          "results": [
                            {
                              "chunkId": "weather-md-0",
                              "content": "The Weather API provides real-time data...",
                              "similarity": 0.95,
                              "metadata": {
                                "source": "weather.md",
                                "title": "Weather API Documentation",
                                "section": "Introduction"
                              }
                            }
                          ]
                        }
                        """
                )
            )
        ),
        @ApiResponse(
            responseCode = "400",
            description = "Bad request - empty or missing query parameter",
            content = @Content
        ),
        @ApiResponse(
            responseCode = "500",
            description = "Internal server error - embedding service unavailable",
            content = @Content
        )
    })
    public ResponseEntity<SearchResponse> search(
            @Parameter(
                description = "Search query text",
                required = true,
                example = "weather api documentation"
            )
            @RequestParam String query,
            @Parameter(
                description = "Number of results to return (default: 10)",
                required = false,
                example = "10"
            )
            @RequestParam(defaultValue = "10") int topK) {
        
        logger.info("Received search request: query='{}', topK={}", query, topK);

        if (query == null || query.isBlank()) {
            logger.warn("Search query is empty");
            return ResponseEntity.badRequest().build();
        }

        try {
            float[] queryEmbedding = indexingService.generateQueryEmbedding(query);
            List<VectorStorageService.SearchResult> rawResults = storageService.search(queryEmbedding, topK);
            
            // Convert to DTO results
            List<SearchResult> results = rawResults.stream()
                .map(r -> {
                    Map<String, Object> metadata = new HashMap<>();
                    if (r.getChunk() != null) {
                        metadata.put("source", r.getChunk().getSource());
                        metadata.put("title", r.getChunk().getTitle());
                        metadata.put("section", r.getChunk().getSection());
                        metadata.put("chunkIndex", r.getChunk().getChunkIndex());
                    }
                    return SearchResult.of(
                        r.getChunkId(),
                        r.getChunk() != null ? r.getChunk().getContent() : "",
                        r.getSimilarity(),
                        metadata
                    );
                })
                .toList();
            
            SearchResponse response = SearchResponse.of(query, topK, results);
            logger.debug("Search completed: found {} results", results.size());
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            logger.error("Search failed for query '{}': {}", query, e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Delete a document and all associated chunks/vectors.
     * 
     * @param source the source identifier (file path or URL)
     * @return deletion result with count of deleted items
     */
    @DeleteMapping("/documents/{source}")
    @Operation(
        summary = "Delete indexed document",
        description = "Delete a document and all its associated chunks and vector embeddings from the index."
    )
    @ApiResponses(value = {
        @ApiResponse(
            responseCode = "200",
            description = "Document deleted successfully",
            content = @Content(
                mediaType = "application/json",
                examples = @ExampleObject(
                    name = "Success",
                    summary = "Document deleted",
                    value = """
                        {
                          "success": true,
                          "source": "weather.md",
                          "message": "Successfully deleted document vectors"
                        }
                        """
                )
            )
        ),
        @ApiResponse(
            responseCode = "500",
            description = "Internal server error - failed to delete document",
            content = @Content(
                mediaType = "application/json",
                examples = @ExampleObject(
                    name = "Error",
                    summary = "Deletion failed",
                    value = """
                        {
                          "success": false,
                          "source": "weather.md",
                          "error": "Failed to delete document: ..."
                        }
                        """
                )
            )
        )
    })
    public ResponseEntity<Map<String, Object>> delete(@PathVariable String source) {
        logger.info("Received delete request for source: {}", source);

        Map<String, Object> response = new HashMap<>();

        try {
            storageService.deleteBySource(source);
            
            response.put("success", true);
            response.put("source", source);
            response.put("message", "Successfully deleted document vectors");
            
            logger.info("Successfully deleted document vectors for source '{}'", source);
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            logger.error("Failed to delete document '{}': {}", source, e.getMessage());
            response.put("success", false);
            response.put("source", source);
            response.put("error", "Failed to delete document: " + e.getMessage());
            return ResponseEntity.internalServerError().body(response);
        }
    }
    
    /**
     * Get statistics about the RAG index.
     * Returns document count, chunk count, average chunks per document, and index size.
     * 
     * @return statistics map with totalDocuments, totalChunks, avgChunksPerDoc, indexSize
     */
    @GetMapping("/statistics")
    @Operation(
        summary = "Get index statistics",
        description = "Get statistics about the RAG index including document count, chunk count, " +
            "average chunks per document, and estimated index size."
    )
    @ApiResponses(value = {
        @ApiResponse(
            responseCode = "200",
            description = "Statistics retrieved successfully",
            content = @Content(
                mediaType = "application/json",
                examples = @ExampleObject(
                    name = "Success",
                    summary = "Index statistics",
                    value = """
                        {
                          "totalDocuments": 5,
                          "totalChunks": 23,
                          "avgChunksPerDoc": 4.6,
                          "indexSize": "1.2 MB"
                        }
                        """
                )
            )
        ),
        @ApiResponse(
            responseCode = "500",
            description = "Internal server error - failed to get statistics",
            content = @Content(
                mediaType = "application/json",
                examples = @ExampleObject(
                    name = "Error",
                    summary = "Statistics retrieval failed",
                    value = """
                        {
                          "error": "Failed to get statistics: ..."
                        }
                        """
                )
            )
        )
    })
    public ResponseEntity<Map<String, Object>> getStatistics() {
        logger.info("Received statistics request");
        
        try {
            int totalChunks = storageService.getChunkCount();
            int totalDocuments = storageService.getDocumentCount();
            double avgChunksPerDoc = totalDocuments > 0 ? (double) totalChunks / totalDocuments : 0.0;
            
            // Estimate index size (approximate: 768 floats per vector + metadata overhead)
            // Each float is 4 bytes, so 768 * 4 = 3072 bytes per vector for embedding alone
            // Add ~500 bytes for metadata and chunk content reference
            long estimatedIndexSizeBytes = (long) totalChunks * (768 * 4 + 500);
            String indexSize = formatSize(estimatedIndexSizeBytes);
            
            Map<String, Object> stats = new HashMap<>();
            stats.put("totalDocuments", totalDocuments);
            stats.put("totalChunks", totalChunks);
            stats.put("avgChunksPerDoc", Math.round(avgChunksPerDoc * 100.0) / 100.0);
            stats.put("indexSize", indexSize);
            
            logger.debug("Statistics: documents={}, chunks={}, avg={}, size={}", 
                totalDocuments, totalChunks, avgChunksPerDoc, indexSize);
            return ResponseEntity.ok(stats);
            
        } catch (Exception e) {
            logger.error("Failed to get statistics", e);
            Map<String, Object> error = new HashMap<>();
            error.put("error", "Failed to get statistics: " + e.getMessage());
            return ResponseEntity.internalServerError().body(error);
        }
    }
    
    /**
     * Format byte size to human-readable string.
     */
    private String formatSize(long bytes) {
        if (bytes < 1024) {
            return bytes + " B";
        } else if (bytes < 1024 * 1024) {
            return String.format("%.1f KB", bytes / 1024.0);
        } else if (bytes < 1024 * 1024 * 1024) {
            return String.format("%.1f MB", bytes / (1024.0 * 1024.0));
        } else {
            return String.format("%.1f GB", bytes / (1024.0 * 1024.0 * 1024.0));
        }
    }
}
