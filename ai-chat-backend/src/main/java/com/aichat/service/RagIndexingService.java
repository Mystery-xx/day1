package com.aichat.service;

import com.aichat.config.ChunkingProperties;
import com.aichat.dto.IndexResult;
import com.aichat.entity.DocumentChunk;
import com.aichat.service.chunking.ChunkingStrategy;
import com.aichat.service.chunking.ChunkingType;
import com.aichat.service.chunking.FixedSizeChunkingStrategy;
import com.aichat.service.chunking.SemanticChunkingStrategy;
import com.aichat.service.embedding.EmbeddingService;
import com.aichat.service.storage.VectorStorageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

@Service
public class RagIndexingService {
    private static final Logger logger = LoggerFactory.getLogger(RagIndexingService.class);
    
    private final ChunkingProperties properties;
    private final FixedSizeChunkingStrategy fixedStrategy;
    private final SemanticChunkingStrategy semanticStrategy;
    private final EmbeddingService embeddingService;
    private final VectorStorageService storageService;
    private final FileUploadValidator validator;
    
    public RagIndexingService(ChunkingProperties properties,
                              FixedSizeChunkingStrategy fixedStrategy,
                              SemanticChunkingStrategy semanticStrategy,
                              EmbeddingService embeddingService,
                              VectorStorageService storageService,
                              FileUploadValidator validator) {
        this.properties = properties;
        this.fixedStrategy = fixedStrategy;
        this.semanticStrategy = semanticStrategy;
        this.embeddingService = embeddingService;
        this.storageService = storageService;
        this.validator = validator;
    }
    
    public IndexResult index(MultipartFile file, ChunkingType strategy) {
        String filename = file.getOriginalFilename();
        System.out.println("[RAG-DEBUG] Starting indexing pipeline for file: " + filename);
        logger.info("Starting indexing pipeline for file: {} with strategy: {}", filename, strategy);
        
        List<DocumentChunk> createdChunks = new ArrayList<>();
        String source = null;
        
        try {
            validator.validate(file);
            System.out.println("[RAG-DEBUG] File validation passed: " + filename);
            logger.info("File validation passed: {}", filename);
            
            String content = readFileContent(file);
            if (content == null || content.trim().isEmpty()) {
                logger.warn("File {} has empty content", filename);
                throw new IllegalArgumentException("File content is empty");
            }
            logger.info("Read {} characters from file: {}", content.length(), filename);
            
            ChunkingStrategy chunkingStrategy = selectStrategy(strategy);
            logger.info("Using chunking strategy: {}", chunkingStrategy.getType());
            
            source = generateSourceId(filename);
            String title = extractTitle(filename);
            List<DocumentChunk> chunks = chunkingStrategy.chunk(content, source, title);
            
            if (chunks.isEmpty()) {
                logger.warn("No chunks generated from file: {}", filename);
                throw new IllegalArgumentException("Failed to generate chunks from file");
            }
            System.out.println("[RAG-DEBUG] Generated " + chunks.size() + " chunks from file: " + filename);
            logger.info("Generated {} chunks from file: {}", chunks.size(), filename);
            
            List<String> chunkTexts = new ArrayList<>();
            for (DocumentChunk chunk : chunks) {
                if (chunk.getContent() != null && !chunk.getContent().trim().isEmpty()) {
                    chunkTexts.add(chunk.getContent());
                } else {
                    logger.warn("Skipping empty chunk: {}", chunk.getChunkId());
                }
            }
            
            if (chunkTexts.isEmpty()) {
                logger.warn("All chunks were empty, skipping embedding generation");
                throw new IllegalArgumentException("No valid content to embed");
            }
            
            List<float[]> embeddings = embeddingService.generateBatch(chunkTexts);
            System.out.println("[RAG-DEBUG] Generated " + embeddings.size() + " embeddings in batch");
            logger.info("Generated {} embeddings in batch", embeddings.size());
            
            int embeddingIndex = 0;
            for (DocumentChunk chunk : chunks) {
                if (embeddingIndex < embeddings.size()) {
                    chunk.setEmbedding(embeddings.get(embeddingIndex++));
                    createdChunks.add(chunk);
                }
            }
            
            for (DocumentChunk chunk : createdChunks) {
                storageService.save(chunk.getChunkId(), chunk.getEmbedding(), chunk);
            }
            System.out.println("[RAG-DEBUG] Successfully saved " + createdChunks.size() + " chunks to vector storage");
            logger.info("Successfully saved {} chunks to vector storage", createdChunks.size());
            
            IndexResult result = IndexResult.success(source, createdChunks.size());
            logger.info("Indexing pipeline completed successfully for file: {} - {}", filename, result);
            return result;
            
        } catch (Exception e) {
            logger.error("Indexing pipeline failed for file: {}. Rolling back {} chunks", 
                filename, createdChunks.size(), e);
            
            rollback(createdChunks, source != null ? source : generateSourceId(filename));
            
            return IndexResult.failure(
                filename != null ? filename : "unknown",
                e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()
            );
        }
    }
    
    private ChunkingStrategy selectStrategy(ChunkingType requestedStrategy) {
        ChunkingType strategy = requestedStrategy != null 
            ? requestedStrategy 
            : properties.getStrategy();
        
        logger.debug("Selected chunking strategy: {} (requested: {}, default: {})", 
            strategy, requestedStrategy, properties.getStrategy());
        
        return switch (strategy) {
            case FIXED_SIZE -> fixedStrategy;
            case SEMANTIC -> semanticStrategy;
        };
    }
    
    private String readFileContent(MultipartFile file) throws IOException {
        return new String(file.getBytes(), StandardCharsets.UTF_8);
    }
    
    private String generateSourceId(String filename) {
        if (filename == null || filename.isEmpty()) {
            return "unknown-" + System.currentTimeMillis();
        }
        return filename.replaceAll("[^a-zA-Z0-9]", "-") + "-" + System.currentTimeMillis();
    }
    
    private String extractTitle(String filename) {
        if (filename == null || filename.isEmpty()) {
            return "Untitled Document";
        }
        String title = filename;
        int lastDotIndex = filename.lastIndexOf('.');
        if (lastDotIndex > 0) {
            title = filename.substring(0, lastDotIndex);
        }
        return title.replaceAll("[^a-zA-Z0-9\\s-]", "").trim();
    }
    
    private void rollback(List<DocumentChunk> chunks, String source) {
        try {
            logger.info("Rollback: Deleting {} chunks for source: {}", chunks.size(), source);
            storageService.deleteBySource(source);
            logger.info("Rollback completed successfully for source: {}", source);
        } catch (Exception e) {
            logger.error("Rollback failed for source: {}. Manual cleanup may be required.", source, e);
            throw new RuntimeException("Rollback failed: " + e.getMessage(), e);
        }
    }
    
    public float[] generateQueryEmbedding(String query) {
        logger.debug("Generating embedding for query: {}", query);
        return embeddingService.generateEmbedding(query);
    }
}
