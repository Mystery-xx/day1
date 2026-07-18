package com.aichat.service.embedding;

import com.aichat.service.ollama.OllamaClient;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

@Service
public class EmbeddingService {
    private static final Logger logger = LoggerFactory.getLogger(EmbeddingService.class);
    private final OllamaClient ollamaClient;
    private final Cache<String, float[]> embeddingCache;
    private static final String DEFAULT_MODEL = "nomic-embed-text";
    
    public EmbeddingService(OllamaClient ollamaClient) {
        this.ollamaClient = ollamaClient;
        this.embeddingCache = Caffeine.newBuilder()
            .maximumSize(10000)
            .expireAfterWrite(1, TimeUnit.HOURS)
            .build();
    }
    
    public float[] generateEmbedding(String text) {
        return generateEmbedding(text, DEFAULT_MODEL);
    }
    
    public float[] generateEmbedding(String text, String model) {
        if (text == null || text.trim().isEmpty()) {
            throw new IllegalArgumentException("Text cannot be empty");
        }
        
        String cacheKey = model + ":" + text.hashCode();
        float[] cached = embeddingCache.getIfPresent(cacheKey);
        if (cached != null) {
            logger.debug("Cache hit for embedding");
            return cached;
        }
        
        long startTime = System.currentTimeMillis();
        float[] embedding = ollamaClient.generateEmbedding(text, model);
        long duration = System.currentTimeMillis() - startTime;
        
        embeddingCache.put(cacheKey, embedding);
        logger.info("Generated embedding for {} tokens in {}ms", text.split("\\s+").length, duration);
        
        return embedding;
    }
    
    public List<float[]> generateBatch(List<String> texts) {
        List<float[]> embeddings = new ArrayList<>();
        System.out.println("[EMBED-DEBUG] Generating " + texts.size() + " embeddings via Ollama");
        for (String text : texts) {
            System.out.println("[EMBED-DEBUG] Calling Ollama API for embedding");
            embeddings.add(generateEmbedding(text));
        }
        System.out.println("[EMBED-DEBUG] Generated " + embeddings.size() + " embeddings successfully");
        return embeddings;
    }
}
