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

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
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
        // Detect encoding and read file
        Charset detectedCharset = detectEncoding(file);
        logger.info("Detected encoding: {} for file: {}", detectedCharset.name(), file.getOriginalFilename());
        
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream(), detectedCharset))) {
            StringBuilder content = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                content.append(line).append("\n");
            }
            return content.toString();
        }
    }
    
    /**
     * Detect file encoding by checking BOM and trying common charsets.
     * Falls back to UTF-8 if detection fails.
     */
    private Charset detectEncoding(MultipartFile file) throws IOException {
        byte[] bytes = file.getBytes();
        if (bytes.length < 2) {
            return StandardCharsets.UTF_8;
        }
        
        // Check for BOM (Byte Order Mark)
        if (bytes.length >= 3 && 
            (bytes[0] & 0xFF) == 0xEF && (bytes[1] & 0xFF) == 0xBB && (bytes[2] & 0xFF) == 0xBF) {
            return StandardCharsets.UTF_8;
        }
        if (bytes.length >= 2 && 
            (bytes[0] & 0xFF) == 0xFE && (bytes[1] & 0xFF) == 0xFF) {
            return StandardCharsets.UTF_16BE;
        }
        if (bytes.length >= 2 && 
            (bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xFF) == 0xFE) {
            return StandardCharsets.UTF_16LE;
        }
        
        // Count byte patterns to detect encoding
        int cyrillicWindows1251 = 0;  // Bytes 0xC0-0xFF (most common Cyrillic)
        int cyrillicIso88595Unique = 0; // Bytes 0xB0-0xBF (unique to ISO-8859-5, not in Windows-1251)
        int cyrillicIbm866Unique = 0;   // Bytes 0x80-0xAF (unique to IBM866/CP866)
        int validUtf8Cyrillic = 0;      // Valid UTF-8 Cyrillic sequences
        int invalidUtf8 = 0;            // High bytes that are not valid UTF-8
        
        for (int i = 0; i < Math.min(bytes.length, 1024); i++) {
            byte b = bytes[i];
            int unsigned = b & 0xFF;
            
            // Check for valid UTF-8 Cyrillic (0xD0-0xD1 followed by 0x80-0xBF)
            if (unsigned >= 0xD0 && unsigned <= 0xD1 && i + 1 < bytes.length) {
                byte next = bytes[i + 1];
                if ((next & 0xFF) >= 0x80 && (next & 0xFF) <= 0xBF) {
                    validUtf8Cyrillic++;
                    i++; // Skip next byte
                    continue;
                }
            }
            
            // Check for invalid UTF-8 sequences (high bit set but not valid UTF-8)
            if ((b & 0x80) != 0) {
                boolean isValidUtf8 = false;
                // 2-byte sequence
                if ((b & 0xE0) == 0xC0 && i + 1 < bytes.length) {
                    byte next = bytes[i + 1];
                    if ((next & 0xC0) == 0x80) {
                        isValidUtf8 = true;
                        i++;
                    }
                }
                // 3-byte sequence
                else if ((b & 0xF0) == 0xE0 && i + 2 < bytes.length) {
                    byte next1 = bytes[i + 1];
                    byte next2 = bytes[i + 2];
                    if ((next1 & 0xC0) == 0x80 && (next2 & 0xC0) == 0x80) {
                        isValidUtf8 = true;
                        i += 2;
                    }
                }
                // 4-byte sequence
                else if ((b & 0xF8) == 0xF0 && i + 3 < bytes.length) {
                    byte next1 = bytes[i + 1];
                    byte next2 = bytes[i + 2];
                    byte next3 = bytes[i + 3];
                    if ((next1 & 0xC0) == 0x80 && (next2 & 0xC0) == 0x80 && (next3 & 0xC0) == 0x80) {
                        isValidUtf8 = true;
                        i += 3;
                    }
                }
                
                if (!isValidUtf8) {
                    invalidUtf8++;
                    
                    // Count unique ranges for different Cyrillic encodings
                    // IBM866 unique: 0x80-0xAF
                    if (unsigned >= 0x80 && unsigned <= 0xAF) {
                        cyrillicIbm866Unique++;
                    }
                    // ISO-8859-5 unique: 0xB0-0xBF (not in Windows-1251)
                    else if (unsigned >= 0xB0 && unsigned <= 0xBF) {
                        cyrillicIso88595Unique++;
                    }
                    // Windows-1251: 0xC0-0xFF (most common for Cyrillic)
                    else if (unsigned >= 0xC0 && unsigned <= 0xFF) {
                        cyrillicWindows1251++;
                    }
                }
            }
        }
        
        logger.debug("Encoding detection: Win1251={}, ISO8859-5={}, IBM866={}, validUTF8={}, invalidUTF8={}", 
            cyrillicWindows1251, cyrillicIso88595Unique, cyrillicIbm866Unique, validUtf8Cyrillic, invalidUtf8);
        
        // Priority 1: If mostly valid UTF-8 Cyrillic, use UTF-8
        if (validUtf8Cyrillic > 10 && invalidUtf8 < 5) {
            return StandardCharsets.UTF_8;
        }
        
        // Priority 2: IBM866 (DOS Cyrillic) - unique range 0x80-0xAF
        if (cyrillicIbm866Unique > 10) {
            return Charset.forName("IBM866");
        }
        
        // Priority 3: ISO-8859-5 - unique range 0xB0-0xBF
        if (cyrillicIso88595Unique > 10) {
            return Charset.forName("ISO-8859-5");
        }
        
        // Priority 4: Windows-1251 - most common Cyrillic encoding (0xC0-0xFF)
        if (cyrillicWindows1251 > 10) {
            return Charset.forName("windows-1251");
        }
        
        // Default to UTF-8
        return StandardCharsets.UTF_8;
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
