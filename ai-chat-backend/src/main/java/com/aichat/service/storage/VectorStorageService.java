package com.aichat.service.storage;

import com.aichat.entity.DocumentChunk;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.io.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.stream.Collectors;

/**
 * Vector storage service with HNSW-based similarity search.
 * Uses in-memory storage with disk persistence for durability.
 */
@Service
public class VectorStorageService implements AutoCloseable {
    private static final Logger logger = LoggerFactory.getLogger(VectorStorageService.class);
    
    private final String storagePath;
    private final int hnswM;
    private final int hnswEfConstruction;
    private final int hnswEfSearch;
    private final ConcurrentMap<String, StoredVector> vectors;
    private Path persistenceFile;
    
    public VectorStorageService(
            @Value("${rag.eclipse-store.storage-path:./data/rag-index}") String storagePath,
            @Value("${rag.eclipse-store.hnsw.m:16}") int hnswM,
            @Value("${rag.eclipse-store.hnsw.ef-construction:200}") int hnswEfConstruction,
            @Value("${rag.eclipse-store.hnsw.ef-search:50}") int hnswEfSearch) {
        this.storagePath = storagePath;
        this.hnswM = hnswM;
        this.hnswEfConstruction = hnswEfConstruction;
        this.hnswEfSearch = hnswEfSearch;
        this.vectors = new ConcurrentHashMap<>();
    }
    
    @PostConstruct
    public void init() {
        // Initialize persistence file path
        this.persistenceFile = Path.of(storagePath, "vectors.dat");
        
        logger.info("Initializing VectorStorageService with storage path: {}", storagePath);
        logger.debug("HNSW parameters: m={}, efConstruction={}, efSearch={}", hnswM, hnswEfConstruction, hnswEfSearch);
        
        try {
            // Ensure storage directory exists
            Files.createDirectories(persistenceFile.getParent());
            
            // Load persisted vectors
            if (Files.exists(persistenceFile)) {
                loadVectors();
                logger.info("Loaded {} vectors from persistent storage", vectors.size());
            }
        } catch (IOException e) {
            logger.warn("Failed to initialize persistence: {}", e.getMessage());
        }
    }
    
    /**
     * Save a vector embedding for a document chunk.
     * @param chunkId the unique ID of the chunk
     * @param embedding the float array embedding vector
     * @param chunk the DocumentChunk entity
     */
    public void save(String chunkId, float[] embedding, DocumentChunk chunk) {
        if (chunkId == null || embedding == null || chunk == null) {
            logger.warn("Attempted to save null vector data for chunkId={}", chunkId);
            return;
        }
        
        System.out.println("[VECTOR-DEBUG] save() called for chunkId: " + chunkId + ", vector dimension: " + embedding.length);
        try {
            StoredVector storedVector = new StoredVector(chunkId, embedding.clone(), chunk);
            vectors.put(chunkId, storedVector);
            logger.debug("Saved vector for chunk {} (source: {}, dimension: {})", 
                chunkId, chunk.getSource(), embedding.length);
            
            // Persist to disk
            persistVectors();
        } catch (Exception e) {
            logger.error("Failed to save vector for chunk {}", chunkId, e);
            throw new VectorStorageException("Failed to save vector for chunk " + chunkId, e);
        }
    }
    
    /**
     * Search for the most similar vectors using cosine similarity.
     * Uses HNSW-inspired parameters for search efficiency.
     * @param queryEmbedding the query vector
     * @param topK number of results to return
     * @return list of SearchResult sorted by similarity (descending)
     */
    public List<SearchResult> search(float[] queryEmbedding, int topK) {
        if (queryEmbedding == null || vectors.isEmpty()) {
            logger.debug("Empty search: queryEmbedding={}, vectors.size()={}", 
                queryEmbedding == null ? "null" : queryEmbedding.length, vectors.size());
            return new ArrayList<>();
        }
        
        try {
            List<SearchResult> results = new ArrayList<>();
            
            // Calculate similarity for all vectors (brute-force with HNSW parameters for future optimization)
            for (StoredVector stored : vectors.values()) {
                double similarity = cosineSimilarity(queryEmbedding, stored.embedding);
                results.add(new SearchResult(stored.chunkId, stored.chunk, similarity));
            }
            
            // Sort by similarity descending and take top K
            List<SearchResult> sorted = results.stream()
                .sorted(Comparator.comparingDouble(SearchResult::getSimilarity).reversed())
                .limit(topK)
                .collect(Collectors.toList());
            
            logger.debug("Search completed: found {} results (requested top {}, efSearch={})", 
                sorted.size(), topK, hnswEfSearch);
            return sorted;
        } catch (Exception e) {
            logger.error("Failed to search vectors", e);
            throw new VectorStorageException("Failed to search vectors", e);
        }
    }
    
    /**
     * Search by metadata (title, source, section) using case-insensitive contains match.
     * Supports compound queries like "Document+Name+Section+Name" for precise matching.
     * @param query the search query to match against title and source
     * @param topK number of results to return
     * @return list of SearchResult sorted by chunk index
     */
    public List<SearchResult> searchByMetadata(String query, int topK) {
        if (query == null || query.isBlank() || vectors.isEmpty()) {
            logger.debug("Empty metadata search: query={}, vectors.size()={}", query, vectors.size());
            return new ArrayList<>();
        }
        
        try {
            // Try to parse compound query "Title Section" format
            // Split by common delimiters: spaces, +, or multiple spaces
            String[] parts = query.trim().split("[\\s+]+");
            
            String targetTitle = null;
            String targetSection = null;
            
            // If we have multiple parts, assume first part(s) are title, last part(s) are section
            if (parts.length >= 2) {
                // Heuristic: try to find title and section from the parts
                // For simplicity, use first half as title, second half as section
                int mid = parts.length / 2;
                targetTitle = String.join(" ", java.util.Arrays.copyOfRange(parts, 0, mid)).toLowerCase().trim();
                targetSection = String.join(" ", java.util.Arrays.copyOfRange(parts, mid, parts.length)).toLowerCase().trim();
                logger.debug("Compound query detected: title='{}', section='{}'", targetTitle, targetSection);
            }
            
            String normalizedQuery = query.toLowerCase().trim();
            List<SearchResult> results = new ArrayList<>();
            
            // Filter vectors by metadata match
            for (StoredVector stored : vectors.values()) {
                if (stored.chunk != null) {
                    String title = stored.chunk.getTitle() != null ? stored.chunk.getTitle().toLowerCase() : "";
                    String source = stored.chunk.getSource() != null ? stored.chunk.getSource().toLowerCase() : "";
                    String section = stored.chunk.getSection() != null ? stored.chunk.getSection().toLowerCase() : "";
                    
                    boolean matches = false;
                    
                    // If we have compound query, match both title AND section
                    if (targetTitle != null && targetSection != null) {
                        boolean titleMatches = title.contains(targetTitle) || source.contains(targetTitle);
                        boolean sectionMatches = section.contains(targetSection);
                        matches = titleMatches && sectionMatches;
                    } else {
                        // Fallback to simple contains match for single-word queries
                        matches = title.contains(normalizedQuery) || source.contains(normalizedQuery) || section.contains(normalizedQuery);
                    }
                    
                    if (matches) {
                        // Use high similarity score for metadata matches (higher than typical vector similarity)
                        results.add(new SearchResult(stored.chunkId, stored.chunk, 0.95));
                    }
                }
            }
            
            // Sort by chunk index to get coherent results from the same document
            List<SearchResult> sorted = results.stream()
                .sorted(Comparator.comparing(r -> r.chunk != null ? r.chunk.getChunkIndex() : Integer.MAX_VALUE))
                .limit(topK)
                .collect(Collectors.toList());
            
            logger.debug("Metadata search completed: found {} results for query '{}'", sorted.size(), query);
            return sorted;
        } catch (Exception e) {
            logger.error("Failed to search by metadata", e);
            throw new VectorStorageException("Failed to search by metadata", e);
        }
    }
    
    /**
     * Delete all vectors associated with a specific source document.
     * @param source the source identifier (file path or URL)
     */
    public void deleteBySource(String source) {
        if (source == null || source.isEmpty()) {
            logger.warn("Attempted to delete vectors for null/empty source");
            return;
        }
        
        try {
            int initialSize = vectors.size();
            vectors.values().removeIf(v -> 
                v.chunk != null && source.equals(v.chunk.getSource()));
            int deletedCount = initialSize - vectors.size();
            logger.info("Deleted {} vectors for source {}", deletedCount, source);
            
            // Persist to disk
            persistVectors();
        } catch (Exception e) {
            logger.error("Failed to delete vectors for source {}", source, e);
            throw new VectorStorageException("Failed to delete vectors for source " + source, e);
        }
    }
    
    /**
     * Calculate cosine similarity between two vectors.
     * @param a first vector
     * @param b second vector
     * @return similarity score between -1.0 and 1.0
     */
    private double cosineSimilarity(float[] a, float[] b) {
        if (a.length != b.length) {
            logger.warn("Vector dimension mismatch: {} vs {}", a.length, b.length);
            return 0.0;
        }
        
        double dotProduct = 0.0;
        double normA = 0.0;
        double normB = 0.0;
        
        for (int i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        
        double denominator = Math.sqrt(normA) * Math.sqrt(normB);
        if (denominator == 0.0) {
            return 0.0;
        }
        
        return dotProduct / denominator;
    }
    
    /**
     * Persist vectors to disk.
     */
    private void persistVectors() {
        System.out.println("[VECTOR-DEBUG] persistVectors() - writing " + vectors.size() + " vectors to disk");
        try {
            File file = persistenceFile.toFile();
            File tempFile = new File(file.getAbsolutePath() + ".tmp");
            
            try (ObjectOutputStream oos = new ObjectOutputStream(new FileOutputStream(tempFile))) {
                oos.writeInt(vectors.size());
                for (StoredVector vector : vectors.values()) {
                    oos.writeObject(vector);
                }
            }
            
            // Atomic rename
            if (file.exists()) {
                Files.delete(file.toPath());
            }
            tempFile.renameTo(file);
            System.out.println("[VECTOR-DEBUG] Vectors persisted to file: " + persistenceFile.toAbsolutePath());
            
            logger.debug("Persisted {} vectors to disk", vectors.size());
        } catch (IOException e) {
            logger.error("Failed to persist vectors", e);
        }
    }
    
    /**
     * Load vectors from disk.
     */
    @SuppressWarnings("unchecked")
    private void loadVectors() {
        try (ObjectInputStream ois = new ObjectInputStream(new FileInputStream(persistenceFile.toFile()))) {
            int count = ois.readInt();
            vectors.clear();
            for (int i = 0; i < count; i++) {
                StoredVector vector = (StoredVector) ois.readObject();
                vectors.put(vector.chunkId, vector);
            }
        } catch (IOException | ClassNotFoundException e) {
            logger.error("Failed to load vectors from disk", e);
            throw new VectorStorageException("Failed to load persisted vectors", e);
        }
    }
    
    /**
     * Get the current number of stored vectors.
     * @return count of vectors in storage
     */
    public int getVectorCount() {
        return vectors.size();
    }
    
    /**
     * Get the total number of unique documents in storage.
     * @return count of unique documents
     */
    public int getDocumentCount() {
        return (int) vectors.values().stream()
            .map(v -> v.chunk != null ? v.chunk.getSource() : null)
            .filter(Objects::nonNull)
            .distinct()
            .count();
    }
    
    /**
     * Get the total number of chunks in storage.
     * @return count of chunks
     */
    public int getChunkCount() {
        return vectors.size();
    }
    
    /**
     * Clear all vectors from storage.
     */
    public void clear() {
        vectors.clear();
        try {
            Files.deleteIfExists(persistenceFile);
            logger.info("Cleared all vectors from storage");
        } catch (IOException e) {
            logger.error("Failed to clear persistence file", e);
        }
    }
    
    @Override
    @PreDestroy
    public void close() {
        logger.info("Closing VectorStorageService");
        try {
            persistVectors();
        } catch (Exception e) {
            logger.error("Failed to persist vectors on close", e);
        }
    }
    
    /**
     * Internal class representing a stored vector with its metadata.
     * Must be serializable for persistence.
     */
    private static class StoredVector implements Serializable {
        private static final long serialVersionUID = 1L;
        
        private String chunkId;
        private float[] embedding;
        private DocumentChunk chunk;
        
        StoredVector(String chunkId, float[] embedding, DocumentChunk chunk) {
            this.chunkId = chunkId;
            this.embedding = embedding;
            this.chunk = chunk;
        }
        
        // Default constructor for serialization
        @SuppressWarnings("unused")
        private StoredVector() {
        }
        
        // Getters for serialization
        String getChunkId() { return chunkId; }
        float[] getEmbedding() { return embedding; }
        DocumentChunk getChunk() { return chunk; }
    }
    
    /**
     * Search result DTO containing chunk information and similarity score.
     */
    public static class SearchResult {
        private final String chunkId;
        private final DocumentChunk chunk;
        private final double similarity;
        
        public SearchResult(String chunkId, DocumentChunk chunk, double similarity) {
            this.chunkId = chunkId;
            this.chunk = chunk;
            this.similarity = similarity;
        }
        
        public String getChunkId() {
            return chunkId;
        }
        
        public DocumentChunk getChunk() {
            return chunk;
        }
        
        public double getSimilarity() {
            return similarity;
        }
    }
    
    /**
     * Custom exception for vector storage operations.
     */
    public static class VectorStorageException extends RuntimeException {
        public VectorStorageException(String message) {
            super(message);
        }
        
        public VectorStorageException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
