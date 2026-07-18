package com.aichat.controller;

import com.aichat.dto.IndexResult;
import com.aichat.dto.RagContextResult;
import com.aichat.dto.rag.SearchResponse;
import com.aichat.dto.rag.SearchResult;
import com.aichat.dto.rag.UploadResponse;
import com.aichat.dto.rerank.RerankRequest;
import com.aichat.dto.rerank.RerankResponse;
import com.aichat.dto.rerank.RerankedDocument;
import com.aichat.service.FileUploadValidator;
import com.aichat.service.RagIndexingService;
import com.aichat.service.RagSearchService;
import com.aichat.service.SecurityAuditLogger;
import com.aichat.service.chunking.ChunkingType;
import com.aichat.service.query.QueryRewriteService;
import com.aichat.service.rerank.RerankService;
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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.io.InputStream;
import java.time.Duration;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

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

    @Value("${rag.rerank.base-url:http://tei-reranker:80}")
    private String rerankBaseUrl;

    private WebClient webClient;

    private final RagIndexingService indexingService;
    private final VectorStorageService storageService;
    private final RerankService rerankService;
    private final QueryRewriteService queryRewriteService;
    private final RagSearchService ragSearchService;
    private final SecurityAuditLogger auditLogger;
    private final FileUploadValidator fileUploadValidator;

    public RagController(RagIndexingService indexingService, VectorStorageService storageService,
                        RerankService rerankService, QueryRewriteService queryRewriteService,
                        RagSearchService ragSearchService, SecurityAuditLogger auditLogger,
                        FileUploadValidator fileUploadValidator) {
        this.indexingService = indexingService;
        this.storageService = storageService;
        this.rerankService = rerankService;
        this.queryRewriteService = queryRewriteService;
        this.ragSearchService = ragSearchService;
        this.auditLogger = auditLogger;
        this.fileUploadValidator = fileUploadValidator;
    }

    @PostConstruct
    public void init() {
        HttpClient httpClient = HttpClient.create()
                .responseTimeout(Duration.ofSeconds(1));

        this.webClient = WebClient.builder()
                .baseUrl(rerankBaseUrl)
                .clientConnector(new org.springframework.http.client.reactive.ReactorClientHttpConnector(httpClient))
                .build();
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
        
        String filename = file.getOriginalFilename();
        long fileSize = file.getSize();
        String clientIp = auditLogger.getClientIp();
        
        logger.info("Received file upload request: filename={}, size={}, strategy={}", 
            filename, fileSize, strategy);

        // Validation 1: Check file is not empty
        if (file.isEmpty()) {
            logger.warn("Upload rejected: empty file");
            // TEMP DISABLED: Security audit for FAQ upload
            // auditLogger.logInvalidFileUpload("empty file", filename, fileSize, clientIp);
            UploadResponse response = UploadResponse.error(
                filename != null ? filename : "unknown",
                "File is empty"
            );
            return ResponseEntity.badRequest().body(response);
        }

        // Validation 2: Check file size <= 10MB
        if (fileSize > FileUploadValidator.MAX_FILE_SIZE) {
            logger.warn("Upload rejected: file too large ({} bytes)", fileSize);
            // TEMP DISABLED: Security audit for FAQ upload
        // auditLogger.logInvalidFileUpload("file too large", filename, fileSize, clientIp);
            UploadResponse response = UploadResponse.error(
                filename != null ? filename : "unknown",
                "File size exceeds 10MB limit"
            );
            return ResponseEntity.badRequest().body(response);
        }

        // Validation 3: Validate filename extension (.txt or .md only)
        String extension = getFileExtension(filename);
        if (!FileUploadValidator.ALLOWED_EXTENSIONS.contains(extension.toLowerCase())) {
            logger.warn("Upload rejected: invalid extension '{}' for file '{}'", extension, filename);
            // TEMP DISABLED: Security audit for FAQ upload
        // auditLogger.logInvalidFileUpload("invalid extension", filename, fileSize, clientIp);
            UploadResponse response = UploadResponse.error(
                filename != null ? filename : "unknown",
                "Invalid file extension. Only .txt and .md are allowed"
            );
            return ResponseEntity.badRequest().body(response);
        }

        // Validation 4: Validate content type
        String contentType = file.getContentType();
        if (!isValidContentType(contentType)) {
            logger.warn("Upload rejected: invalid content type '{}'", contentType);
            // TEMP DISABLED: Security audit for FAQ upload
        // auditLogger.logInvalidFileUpload("invalid content type", filename, fileSize, clientIp);
            UploadResponse response = UploadResponse.error(
                filename != null ? filename : "unknown",
                "Invalid content type. Only text/plain, text/markdown, text/x-markdown, application/json are allowed"
            );
            return ResponseEntity.badRequest().body(response);
        }

        // Validation 5: Validate file content (no binary data)
        if (!isValidTextContent(file)) {
            logger.warn("Upload rejected: binary content detected");
            // TEMP DISABLED: Security audit for FAQ upload
        // auditLogger.logInvalidFileUpload("binary content", filename, fileSize, clientIp);
            UploadResponse response = UploadResponse.error(
                filename != null ? filename : "unknown",
                "File contains binary data. Only text files are allowed"
            );
            return ResponseEntity.badRequest().body(response);
        }

        // Validation 6: Validate strategy parameter
        if (strategy != ChunkingType.SEMANTIC && strategy != ChunkingType.FIXED_SIZE) {
            logger.warn("Upload rejected: invalid strategy '{}'", strategy);
            // TEMP DISABLED: Security audit for FAQ upload
        // auditLogger.logInvalidFileUpload("invalid strategy", filename, fileSize, clientIp);
            UploadResponse response = UploadResponse.error(
                filename != null ? filename : "unknown",
                "Invalid strategy. Only SEMANTIC or FIXED_SIZE are allowed"
            );
            return ResponseEntity.badRequest().body(response);
        }

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
            
            // Convert to DTO results with full metadata
            List<SearchResult> results = rawResults.stream()
                .map(r -> {
                    Map<String, Object> metadata = new HashMap<>();
                    if (r.getChunk() != null) {
                        metadata.put("source", r.getChunk().getSource());
                        metadata.put("title", r.getChunk().getTitle());
                        metadata.put("section", r.getChunk().getSection());
                        metadata.put("chunkIndex", r.getChunk().getChunkIndex());
                        metadata.put("startToken", r.getChunk().getStartToken());
                        metadata.put("endToken", r.getChunk().getEndToken());
                        metadata.put("wordCount", r.getChunk().getWordCount());
                        metadata.put("createdAt", r.getChunk().getCreatedAt());
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
     * Hybrid search combining metadata and vector similarity search.
     * First searches by title/source/section metadata, then falls back to vector search.
     * 
     * @param query the search query
     * @param topK number of results to return (default: 10)
     * @return list of search results with metadata match or vector similarity scores
     */
    @GetMapping("/search/hybrid")
    @Operation(
        summary = "Hybrid RAG search - metadata + vector similarity",
        description = "Hybrid search that first tries to match by document title, source, or section. " +
            "If metadata match found, returns those results. Otherwise falls back to vector similarity search."
    )
    @ApiResponses(value = {
        @ApiResponse(
            responseCode = "200",
            description = "Hybrid search results",
            content = @Content(
                mediaType = "application/json",
                schema = @Schema(implementation = SearchResponse.class),
                examples = @ExampleObject(
                    name = "Metadata match",
                    summary = "Found documents by title",
                    value = """
                        {
                          "query": "weather api",
                          "topK": 10,
                          "results": [
                            {
                              "chunkId": "weather-md-0",
                              "content": "The Weather API provides...",
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
            description = "Internal server error",
            content = @Content
        )
    })
    public ResponseEntity<SearchResponse> hybridSearch(
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
        
        logger.info("Received hybrid search request: query='{}', topK={}", query, topK);

        if (query == null || query.isBlank()) {
            logger.warn("Hybrid search query is empty");
            return ResponseEntity.badRequest().build();
        }

        try {
            List<VectorStorageService.SearchResult> rawResults = ragSearchService.hybridSearch(query, topK);
            
            // Convert to DTO results with full metadata
            List<SearchResult> results = rawResults.stream()
                .map(r -> {
                    Map<String, Object> metadata = new HashMap<>();
                    if (r.getChunk() != null) {
                        metadata.put("source", r.getChunk().getSource());
                        metadata.put("title", r.getChunk().getTitle());
                        metadata.put("section", r.getChunk().getSection());
                        metadata.put("chunkIndex", r.getChunk().getChunkIndex());
                        metadata.put("startToken", r.getChunk().getStartToken());
                        metadata.put("endToken", r.getChunk().getEndToken());
                        metadata.put("wordCount", r.getChunk().getWordCount());
                        metadata.put("createdAt", r.getChunk().getCreatedAt());
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
            logger.debug("Hybrid search completed: found {} results", results.size());
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            logger.error("Hybrid search failed for query '{}': {}", query, e.getMessage());
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Enhanced RAG search with optional reranking and query rewriting.
     * Supports advanced retrieval features for improved result quality.
     * 
     * Flow: rewrite query → embed → vector search (top 20) → rerank → filter by threshold → take top 5
     * 
     * @param query the search query
     * @param topK number of results to return (default: 5)
     * @param rerank whether to enable reranking (default: false)
     * @param threshold reranking score threshold for filtering (default: 0.5)
     * @param rewrite whether to enable query rewriting (default: false)
     * @return RagContextResult with context, sources, rerankScores, and queryWasRewritten metadata
     */
    @GetMapping("/search/enhanced")
    @Operation(
        summary = "Enhanced RAG search with reranking and query rewriting",
        description = "Advanced RAG search with optional reranking and query rewriting. " +
            "Flow: rewrite query → embed → vector search (top 20) → rerank → filter by threshold → take top 5. " +
            "Returns RagContextResult with rerankScores and queryWasRewritten metadata."
    )
    @ApiResponses(value = {
        @ApiResponse(
            responseCode = "200",
            description = "Enhanced search results with metadata",
            content = @Content(
                mediaType = "application/json",
                schema = @Schema(implementation = RagContextResult.class),
                examples = @ExampleObject(
                    name = "Reranking enabled",
                    summary = "Search with reranking",
                    value = """
                        {
                          "context": "Use the following context from the knowledge base:\\n\\n...",
                          "sources": [
                            {
                              "source": "ml.md",
                              "title": "Machine Learning",
                              "section": "Introduction",
                              "similarity": 0.92
                            }
                          ],
                          "rerankScores": [0.95, 0.87, 0.76],
                          "queryWasRewritten": true
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
            description = "Internal server error - embedding or reranking service unavailable",
            content = @Content
        )
    })
    public ResponseEntity<RagContextResult> enhancedSearch(
            @Parameter(
                description = "Search query text",
                required = true,
                example = "machine learning"
            )
            @RequestParam String query,
            @Parameter(
                description = "Number of results to return (default: 5)",
                required = false,
                example = "5"
            )
            @RequestParam(defaultValue = "5") int topK,
            @Parameter(
                description = "Enable reranking (default: false)",
                required = false,
                example = "true"
            )
            @RequestParam(defaultValue = "false") boolean rerank,
            @Parameter(
                description = "Reranking score threshold (default: 0.5)",
                required = false,
                example = "0.5"
            )
            @RequestParam(defaultValue = "0.5") double threshold,
            @Parameter(
                description = "Enable query rewriting (default: false)",
                required = false,
                example = "true"
            )
            @RequestParam(defaultValue = "false") boolean rewrite) {
        
        logger.info("Received enhanced search request: query='{}', topK={}, rerank={}, threshold={}, rewrite={}", 
            query, topK, rerank, threshold, rewrite);

        if (query == null || query.isBlank()) {
            logger.warn("Enhanced search query is empty");
            return ResponseEntity.badRequest().build();
        }

        try {
            RagContextResult result = ragSearchService.searchAndAugment(query, topK, rerank, threshold, rewrite);
            logger.debug("Enhanced search completed: results={}, rerankScores={}, queryWasRewritten={}", 
                result.getSources().size(), 
                result.getRerankScores() != null ? result.getRerankScores().size() : 0,
                result.isQueryWasRewritten());
            return ResponseEntity.ok(result);
            
        } catch (Exception e) {
            logger.error("Enhanced search failed for query '{}': {}", query, e.getMessage());
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
     * Rewrite a search query to be more specific and detailed.
     * Uses AI to enhance short queries (< 10 words) for better retrieval.
     * Returns original query if it's already detailed or if rewrite fails.
     * 
     * @param queryRewriteRequest the query to rewrite
     * @return rewritten query or original if skipped/failed
     */
    @PostMapping("/query/rewrite")
    @Operation(
        summary = "Rewrite search query",
        description = "Rewrite a search query to be more specific and detailed using AI. " +
            "Queries with >= 10 words are returned unchanged. Timeout: 2 seconds."
    )
    @ApiResponses(value = {
        @ApiResponse(
            responseCode = "200",
            description = "Query rewritten successfully or returned unchanged",
            content = @Content(
                mediaType = "application/json",
                examples = @ExampleObject(
                    name = "Success",
                    summary = "Query rewritten",
                    value = """
                        {
                          "originalQuery": "RAG pipeline",
                          "rewrittenQuery": "How does the RAG (Retrieval-Augmented Generation) pipeline work?",
                          "wasRewritten": true
                        }
                        """
                )
            )
        ),
        @ApiResponse(
            responseCode = "400",
            description = "Bad request - empty or missing query",
            content = @Content
        )
    })
    public ResponseEntity<Map<String, Object>> rewriteQuery(
            @RequestBody Map<String, String> queryRewriteRequest) {
        
        String query = queryRewriteRequest != null ? queryRewriteRequest.get("query") : null;
        
        if (query == null || query.isBlank()) {
            logger.warn("Query rewrite request with empty query");
            return ResponseEntity.badRequest().build();
        }
        
        logger.info("Received query rewrite request: '{}'", query);
        
        String rewritten = queryRewriteService.rewrite(query);
        boolean wasRewritten = !rewritten.equals(query);
        
        Map<String, Object> response = new HashMap<>();
        response.put("originalQuery", query);
        response.put("rewrittenQuery", rewritten);
        response.put("wasRewritten", wasRewritten);
        
        logger.info("Query rewrite result: original='{}', rewritten='{}', wasRewritten={}", 
            query, rewritten, wasRewritten);
        
        return ResponseEntity.ok(response);
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

    /**
     * Get list of all indexed documents.
     * Returns sorted list of document sources (file names or URLs).
     * 
     * @return list of document sources
     */
    @GetMapping("/documents")
    @Operation(
        summary = "List indexed documents",
        description = "Get a sorted list of all document sources currently indexed in RAG."
    )
    @ApiResponses(value = {
        @ApiResponse(
            responseCode = "200",
            description = "List of documents retrieved successfully",
            content = @Content(
                mediaType = "application/json",
                examples = @ExampleObject(
                    name = "Success",
                    summary = "Document list",
                    value = """
                        [
                          "task-management-guide.md",
                          "weather.md",
                          "Золотой ключик или Приключения Буратино.txt",
                          "Толстой Алексей Константинович.txt"
                        ]
                        """
                )
            )
        ),
        @ApiResponse(
            responseCode = "500",
            description = "Internal server error - failed to get document list",
            content = @Content(
                mediaType = "application/json",
                examples = @ExampleObject(
                    name = "Error",
                    summary = "Failed to retrieve documents",
                    value = """
                        {
                          "error": "Failed to get documents: ..."
                        }
                        """
                )
            )
        )
    })
    public ResponseEntity<List<String>> getDocuments() {
        logger.info("Received documents list request");
        
        try {
            List<String> documents = storageService.getAllSources();
            logger.debug("Documents list: {}", documents);
            return ResponseEntity.ok(documents);
            
        } catch (Exception e) {
            logger.error("Failed to get documents list", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Health check endpoint for RAG services.
     * Returns the status of the TEI reranker service.
     * 
     * @return health status with rerankerStatus (UP/DOWN) and message
     */
    @GetMapping("/health")
    @Operation(
        summary = "RAG health check",
        description = "Check the health status of RAG services, particularly the TEI reranker."
    )
    @ApiResponses(value = {
        @ApiResponse(
            responseCode = "200",
            description = "Health check completed successfully",
            content = @Content(
                mediaType = "application/json",
                examples = {
                    @ExampleObject(
                        name = "Reranker UP",
                        summary = "TEI reranker is available",
                        value = """
                            {
                              "rerankerStatus": "UP",
                              "message": "TEI reranker service is healthy"
                            }
                            """
                    ),
                    @ExampleObject(
                        name = "Reranker DOWN",
                        summary = "TEI reranker is unavailable",
                        value = """
                            {
                              "rerankerStatus": "DOWN",
                              "message": "TEI reranker service is unavailable"
                            }
                            """
                    )
                }
            )
        )
    })
    public ResponseEntity<Map<String, Object>> healthCheck() {
        logger.debug("Health check requested");
        
        Map<String, Object> health = new HashMap<>();
        
        try {
            RerankRequest request = new RerankRequest("health", Collections.singletonList("test"), 1);
            
            @SuppressWarnings("unchecked")
            List<RerankResponse.RerankResult> results = webClient.post()
                    .uri("/rerank")
                    .bodyValue(request)
                    .retrieve()
                    .bodyToMono(List.class)
                    .timeout(Duration.ofSeconds(1))
                    .cast(List.class)
                    .block();
            
            if (results != null && !results.isEmpty()) {
                health.put("rerankerStatus", "UP");
                health.put("message", "TEI reranker service is healthy");
                logger.debug("Health check: reranker UP - {} results", results.size());
            } else {
                health.put("rerankerStatus", "DOWN");
                health.put("message", "TEI reranker service returned empty response");
                logger.debug("Health check: reranker DOWN (empty response)");
            }
            
        } catch (Exception e) {
            health.put("rerankerStatus", "DOWN");
            health.put("message", "TEI reranker service is unavailable");
            logger.debug("Health check: reranker DOWN - {}", e.getMessage());
        }
        
        return ResponseEntity.ok(health);
    }

    /**
     * Test endpoint for reranking functionality.
     * Used for QA scenarios to verify RerankService behavior.
     * 
     * @param request rerank request with query, documents, and topN
     * @return list of reranked documents
     */
    @PostMapping("/rerank/test")
    @Operation(
        summary = "Test reranking endpoint",
        description = "Test endpoint for QA scenarios. Reranks a list of documents based on query relevance."
    )
    @ApiResponses(value = {
        @ApiResponse(
            responseCode = "200",
            description = "Reranking completed successfully",
            content = @Content(
                mediaType = "application/json",
                examples = @ExampleObject(
                    name = "Success",
                    summary = "Reranked documents",
                    value = """
                        [
                          {
                            "text": "Machine learning is a subset of AI",
                            "score": 0.95,
                            "originalIndex": 0
                          },
                          {
                            "text": "Weather forecast for today",
                            "score": 0.12,
                            "originalIndex": 1
                          }
                        ]
                        """
                )
            )
        ),
        @ApiResponse(
            responseCode = "200",
            description = "Baseline results on TEI failure or timeout",
            content = @Content(
                mediaType = "application/json",
                examples = @ExampleObject(
                    name = "Baseline results",
                    summary = "TEI unavailable, returning original documents",
                    value = """
                        [
                          {
                            "text": "Machine learning is a subset of AI",
                            "score": 0.0,
                            "originalIndex": 0
                          },
                          {
                            "text": "Weather forecast for today",
                            "score": 0.0,
                            "originalIndex": 1
                          }
                        ]
                        """
                )
            )
        )
    })
    public ResponseEntity<List<RerankedDocument>> testRerank(
            @RequestBody Map<String, Object> request) {
        
        String query = (String) request.get("query");
        List<String> documents = (List<String>) request.get("documents");
        Integer topN = (Integer) request.get("topN");

        logger.info("Test rerank endpoint called: query='{}', documents={}, topN={}", 
            query, documents != null ? documents.size() : 0, topN);

        if (topN == null) {
            topN = 10;
        }

        List<RerankedDocument> results = rerankService.rerank(query, documents, topN);
        return ResponseEntity.ok(results);
    }

    private String getFileExtension(String filename) {
        if (filename == null || filename.isEmpty()) {
            return "";
        }
        int lastDotIndex = filename.lastIndexOf('.');
        if (lastDotIndex < 0 || lastDotIndex == filename.length() - 1) {
            return "";
        }
        return filename.substring(lastDotIndex);
    }

    private boolean isValidContentType(String contentType) {
        if (contentType == null || contentType.isEmpty()) {
            return false;
        }
        String normalized = contentType.toLowerCase();
        return normalized.equals("text/plain") ||
               normalized.equals("text/markdown") ||
               normalized.equals("text/x-markdown") ||
               normalized.equals("application/json");
    }

    private boolean isValidTextContent(MultipartFile file) {
        try (InputStream inputStream = file.getInputStream()) {
            byte[] buffer = new byte[8192];
            int totalBytes = 0;
            int nonPrintableCount = 0;
            int nullByteCount = 0;
            
            int bytesRead;
            while ((bytesRead = inputStream.read(buffer)) != -1) {
                totalBytes += bytesRead;
                for (int i = 0; i < bytesRead; i++) {
                    int b = buffer[i] & 0xFF; // Treat as unsigned (0-255)
                    if (b == 0) {
                        nullByteCount++;
                    }
                    // Only flag control characters as non-printable (excluding common whitespace)
                    // UTF-8 multibyte chars (128-255) are valid text, not binary
                    if (b < 32 && b != 9 && b != 10 && b != 13) {
                        nonPrintableCount++;
                    }
                }
                if (totalBytes > 1024) {
                    double nullRatio = (double) nullByteCount / totalBytes;
                    double nonPrintableRatio = (double) nonPrintableCount / totalBytes;
                    if (nullRatio > 0.01 || nonPrintableRatio > 0.3) {
                        return false;
                    }
                }
            }
            
            if (totalBytes == 0) {
                return true;
            }
            
            double nullRatio = (double) nullByteCount / totalBytes;
            double nonPrintableRatio = (double) nonPrintableCount / totalBytes;
            
            return nullRatio <= 0.01 && nonPrintableRatio <= 0.3;
            
        } catch (IOException e) {
            logger.warn("Failed to validate file content", e);
            return false;
        }
    }
}
