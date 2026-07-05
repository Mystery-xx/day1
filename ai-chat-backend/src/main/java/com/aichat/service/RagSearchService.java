package com.aichat.service;

import com.aichat.dto.RagContextResult;
import com.aichat.dto.SourceInfo;
import com.aichat.service.storage.VectorStorageService;
import com.aichat.service.storage.VectorStorageService.SearchResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * Service for RAG (Retrieval-Augmented Generation) search and context augmentation.
 * Performs vector similarity search and formats results as context for LLM.
 */
@Service
public class RagSearchService {
    private static final Logger logger = LoggerFactory.getLogger(RagSearchService.class);
    
    private final VectorStorageService storageService;
    private final RagIndexingService indexingService;
    
    public RagSearchService(VectorStorageService storageService, RagIndexingService indexingService) {
        this.storageService = storageService;
        this.indexingService = indexingService;
    }
    
    /**
     * Perform RAG search and return formatted context with sources.
     * @param query the search query
     * @param topK number of results to return
     * @return RagContextResult containing formatted context and source information
     */
    public RagContextResult searchAndAugment(String query, int topK) {
        logger.info("RAG search: query={}, topK={}", query, topK);
        
        // 1. Generate query embedding
        float[] queryEmbedding = indexingService.generateQueryEmbedding(query);
        
        // 2. Search in vector storage
        List<SearchResult> results = storageService.search(queryEmbedding, topK);
        
        logger.info("RAG search: query={}, topK={}, found={}", query, topK, results.size());
        
        // 3. Format context
        String context = formatContext(results);
        
        // 4. Build sources list
        List<SourceInfo> sources = new ArrayList<>();
        for (SearchResult result : results) {
            sources.add(new SourceInfo(
                result.getChunk().getSource(),
                result.getChunk().getTitle(),
                result.getChunk().getSection(),
                result.getSimilarity()
            ));
        }
        
        return new RagContextResult(context, sources);
    }
    
    /**
     * Format search results into a context string for LLM.
     * @param results list of search results with similarity scores
     * @return formatted context string
     */
    private String formatContext(List<SearchResult> results) {
        if (results.isEmpty()) {
            return "No relevant context found in the knowledge base.";
        }
        
        StringBuilder context = new StringBuilder();
        context.append("Use the following context from the knowledge base:\n\n");
        
        for (SearchResult result : results) {
            context.append("[Source: ")
                   .append(result.getChunk().getSource())
                   .append(", section \"")
                   .append(result.getChunk().getSection())
                   .append("\"]\n");
            context.append(result.getChunk().getContent())
                   .append("\n\n");
        }
        
        return context.toString();
    }
}
