package com.aichat.service.benchmark;

import com.aichat.entity.DocumentChunk;
import com.aichat.service.chunking.FixedSizeChunkingStrategy;
import com.aichat.service.embedding.EmbeddingService;
import com.aichat.service.storage.VectorStorageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Benchmark service for chunk size optimization.
 * Tests different chunk sizes and measures indexing time, search latency, and accuracy.
 */
@Service
public class BenchmarkService {
    private static final Logger logger = LoggerFactory.getLogger(BenchmarkService.class);
    
    private final EmbeddingService embeddingService;
    private final VectorStorageService storageService;
    
    // Test chunk sizes: 300, 500, 700, 1000 tokens
    private static final int[] CHUNK_SIZES = {300, 500, 700, 1000};
    private static final int OVERLAP = 50;
    
    // Sample document for consistent testing
    private static final String SAMPLE_DOCUMENT = generateSampleDocument();
    
    public BenchmarkService(EmbeddingService embeddingService, VectorStorageService storageService) {
        this.embeddingService = embeddingService;
        this.storageService = storageService;
    }
    
    /**
     * Run complete benchmark suite across all chunk sizes.
     * @return BenchmarkResults containing metrics for each chunk size
     */
    public BenchmarkResults runFullBenchmark() {
        logger.info("Starting full benchmark suite with chunk sizes: {}", Arrays.toString(CHUNK_SIZES));
        
        BenchmarkResults results = new BenchmarkResults();
        
        for (int chunkSize : CHUNK_SIZES) {
            logger.info("Testing chunk size: {}", chunkSize);
            BenchmarkResult result = testChunkSize(chunkSize);
            results.addResult(result);
        }
        
        results.calculateRecommendations();
        logger.info("Benchmark suite completed. Recommended chunk size: {}", results.getRecommendedChunkSize());
        
        return results;
    }
    
    /**
     * Test a specific chunk size and measure metrics.
     * @param chunkSize the chunk size to test
     * @return BenchmarkResult with measured metrics
     */
    public BenchmarkResult testChunkSize(int chunkSize) {
        logger.info("Running benchmark for chunk size: {} tokens", chunkSize);
        
        long indexingStart = System.currentTimeMillis();
        
        // Create strategy with current chunk size
        FixedSizeChunkingStrategy strategy = new FixedSizeChunkingStrategy(chunkSize, OVERLAP);
        
        // Generate chunks
        List<DocumentChunk> chunks = strategy.chunk(SAMPLE_DOCUMENT, "benchmark-doc", "Benchmark Document");
        int chunkCount = chunks.size();
        logger.debug("Generated {} chunks for chunk size {}", chunkCount, chunkSize);
        
        // Generate embeddings (indexing phase)
        List<String> chunkTexts = new ArrayList<>();
        for (DocumentChunk chunk : chunks) {
            if (chunk.getContent() != null && !chunk.getContent().trim().isEmpty()) {
                chunkTexts.add(chunk.getContent());
            }
        }
        
        long embeddingStart = System.currentTimeMillis();
        List<float[]> embeddings = embeddingService.generateBatch(chunkTexts);
        long embeddingEnd = System.currentTimeMillis();
        
        // Assign embeddings to chunks
        int embeddingIndex = 0;
        for (DocumentChunk chunk : chunks) {
            if (embeddingIndex < embeddings.size()) {
                chunk.setEmbedding(embeddings.get(embeddingIndex++));
            }
        }
        
        long indexingEnd = System.currentTimeMillis();
        long indexingTime = indexingEnd - indexingStart;
        long timePerDocument = indexingTime / Math.max(1, chunkCount);
        
        logger.info("Indexing completed: {} chunks in {}ms ({}ms per chunk)", 
            chunkCount, indexingTime, timePerDocument);
        
        // Measure search latency (multiple queries)
        long searchLatencyTotal = 0;
        int searchIterations = 5;
        
        for (int i = 0; i < searchIterations; i++) {
            float[] queryEmbedding = embeddings.get(i % embeddings.size());
            
            long searchStart = System.currentTimeMillis();
            List<VectorStorageService.SearchResult> searchResults = storageService.search(queryEmbedding, 10);
            long searchEnd = System.currentTimeMillis();
            
            searchLatencyTotal += (searchEnd - searchStart);
        }
        
        long avgSearchLatency = searchLatencyTotal / searchIterations;
        logger.info("Search latency: {}ms (average over {} iterations)", avgSearchLatency, searchIterations);
        
        // Calculate accuracy proxy (coverage - how much of document is retrievable)
        double accuracy = calculateAccuracy(chunks, embeddings);
        logger.info("Accuracy score: {}%", String.format("%.2f", accuracy * 100));
        
        return new BenchmarkResult(chunkSize, chunkCount, indexingTime, timePerDocument, avgSearchLatency, accuracy);
    }
    
    /**
     * Calculate accuracy proxy based on content coverage and embedding quality.
     * @param chunks the generated chunks
     * @param embeddings the generated embeddings
     * @return accuracy score between 0.0 and 1.0
     */
    private double calculateAccuracy(List<DocumentChunk> chunks, List<float[]> embeddings) {
        if (chunks.isEmpty() || embeddings.isEmpty()) {
            return 0.0;
        }
        
        // Coverage: percentage of original document content preserved
        int totalChunkWords = chunks.stream()
            .mapToInt(DocumentChunk::getWordCount)
            .sum();
        
        String[] originalWords = SAMPLE_DOCUMENT.split("\\s+");
        double coverage = Math.min(1.0, (double) totalChunkWords / originalWords.length);
        
        // Embedding quality: check for NaN or zero vectors
        int validEmbeddings = 0;
        for (float[] embedding : embeddings) {
            if (isValidEmbedding(embedding)) {
                validEmbeddings++;
            }
        }
        double embeddingQuality = (double) validEmbeddings / embeddings.size();
        
        // Combined accuracy score
        return (coverage * 0.7 + embeddingQuality * 0.3);
    }
    
    /**
     * Check if embedding vector is valid (no NaN, not all zeros).
     * @param embedding the embedding vector
     * @return true if valid
     */
    private boolean isValidEmbedding(float[] embedding) {
        if (embedding == null || embedding.length == 0) {
            return false;
        }
        
        double sum = 0.0;
        for (float value : embedding) {
            if (Float.isNaN(value) || Float.isInfinite(value)) {
                return false;
            }
            sum += Math.abs(value);
        }
        
        return sum > 0.0;
    }
    
    /**
     * Generate a sample document for consistent benchmarking.
     * Creates a document with ~2000 words covering various topics.
     */
    private static String generateSampleDocument() {
        StringBuilder sb = new StringBuilder();
        
        String[] topics = {
            "Artificial intelligence is transforming the way we interact with technology.",
            "Machine learning algorithms can identify patterns in large datasets.",
            "Natural language processing enables computers to understand human language.",
            "Computer vision systems can recognize objects and faces in images.",
            "Deep learning neural networks have revolutionized AI research.",
            "Reinforcement learning allows agents to learn through trial and error.",
            "Data science combines statistics and programming to extract insights.",
            "Cloud computing provides scalable infrastructure for modern applications.",
            "Cybersecurity protects systems and data from digital threats.",
            "Blockchain technology enables decentralized and transparent transactions."
        };
        
        // Generate ~2000 words by expanding on topics
        for (int i = 0; i < 200; i++) {
            String topic = topics[i % topics.length];
            sb.append(topic).append(" ");
            
            // Add variation to make content more realistic
            sb.append("This field has seen significant advances in recent years. ");
            sb.append("Researchers continue to explore new methodologies and applications. ");
            sb.append("The implications for industry and society are profound. ");
        }
        
        return sb.toString();
    }
    
    /**
     * Benchmark result for a single chunk size.
     */
    public static class BenchmarkResult {
        private final int chunkSize;
        private final int chunkCount;
        private final long indexingTimeMs;
        private final long timePerDocumentMs;
        private final long avgSearchLatencyMs;
        private final double accuracy;
        
        public BenchmarkResult(int chunkSize, int chunkCount, long indexingTimeMs, 
                              long timePerDocumentMs, long avgSearchLatencyMs, double accuracy) {
            this.chunkSize = chunkSize;
            this.chunkCount = chunkCount;
            this.indexingTimeMs = indexingTimeMs;
            this.timePerDocumentMs = timePerDocumentMs;
            this.avgSearchLatencyMs = avgSearchLatencyMs;
            this.accuracy = accuracy;
        }
        
        public int getChunkSize() { return chunkSize; }
        public int getChunkCount() { return chunkCount; }
        public long getIndexingTimeMs() { return indexingTimeMs; }
        public long getTimePerDocumentMs() { return timePerDocumentMs; }
        public long getAvgSearchLatencyMs() { return avgSearchLatencyMs; }
        public double getAccuracy() { return accuracy; }
        
        /**
         * Calculate composite score (lower is better).
         * Balances speed and accuracy.
         */
        public double getCompositeScore() {
            // Normalize metrics and combine
            double speedScore = timePerDocumentMs * 0.4 + avgSearchLatencyMs * 0.3;
            double accuracyPenalty = (1.0 - accuracy) * 100 * 0.3;
            return speedScore + accuracyPenalty;
        }
    }
    
    /**
     * Collection of benchmark results with analysis.
     */
    public static class BenchmarkResults {
        private final Map<Integer, BenchmarkResult> results = new ConcurrentHashMap<>();
        private int recommendedChunkSize;
        private String recommendation;
        
        public void addResult(BenchmarkResult result) {
            results.put(result.getChunkSize(), result);
        }
        
        public BenchmarkResult getResult(int chunkSize) {
            return results.get(chunkSize);
        }
        
        public Collection<BenchmarkResult> getAllResults() {
            return results.values();
        }
        
        /**
         * Analyze results and determine optimal chunk size.
         */
        public void calculateRecommendations() {
            if (results.isEmpty()) {
                recommendedChunkSize = 500;
                recommendation = "No benchmark data available, using default";
                return;
            }
            
            // Find chunk size with best composite score
            BenchmarkResult best = results.values().stream()
                .min(Comparator.comparingDouble(BenchmarkResult::getCompositeScore))
                .orElse(results.get(500));
            
            recommendedChunkSize = best.getChunkSize();
            
            // Generate recommendation text
            StringBuilder sb = new StringBuilder();
            sb.append("Optimal chunk size: ").append(recommendedChunkSize).append(" tokens. ");
            sb.append("Balance between indexing speed (").append(best.getTimePerDocumentMs())
              .append("ms/chunk) and search latency (").append(best.getAvgSearchLatencyMs())
              .append("ms) with ").append(String.format("%.1f", best.getAccuracy() * 100))
              .append("% accuracy.");
            
            recommendation = sb.toString();
            logger.info("Benchmark recommendation: {}", recommendation);
        }
        
        public int getRecommendedChunkSize() {
            return recommendedChunkSize;
        }
        
        public String getRecommendation() {
            return recommendation;
        }
        
        /**
         * Generate markdown table of results.
         */
        public String toMarkdownTable() {
            StringBuilder sb = new StringBuilder();
            sb.append("| Chunk Size | Chunks | Index Time (ms) | Time/Chunk (ms) | Search Latency (ms) | Accuracy (%) | Composite Score |\n");
            sb.append("|------------|--------|-----------------|-----------------|---------------------|--------------|----------------|\n");
            
            for (int size : CHUNK_SIZES) {
                BenchmarkResult r = results.get(size);
                if (r != null) {
                    sb.append(String.format("| %d | %d | %d | %d | %d | %.1f | %.2f |\n",
                        r.getChunkSize(),
                        r.getChunkCount(),
                        r.getIndexingTimeMs(),
                        r.getTimePerDocumentMs(),
                        r.getAvgSearchLatencyMs(),
                        r.getAccuracy() * 100,
                        r.getCompositeScore()
                    ));
                }
            }
            
            return sb.toString();
        }
    }
}
