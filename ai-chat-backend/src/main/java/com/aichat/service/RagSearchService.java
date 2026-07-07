package com.aichat.service;

import com.aichat.config.RerankProperties;
import com.aichat.dto.RagContextResult;
import com.aichat.dto.SourceInfo;
import com.aichat.dto.rerank.RerankedDocument;
import com.aichat.service.query.QueryRewriteService;
import com.aichat.service.rerank.RerankService;
import com.aichat.service.storage.VectorStorageService;
import com.aichat.service.storage.VectorStorageService.SearchResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Service for RAG (Retrieval-Augmented Generation) search and context augmentation.
 * Performs vector similarity search and formats results as context for LLM.
 * Supports query rewriting and reranking for improved retrieval quality.
 */
@Service
public class RagSearchService {
    private static final Logger logger = LoggerFactory.getLogger(RagSearchService.class);
    
    private final VectorStorageService storageService;
    private final RagIndexingService indexingService;
    private final RerankService rerankService;
    private final QueryRewriteService queryRewriteService;
    private final RerankProperties rerankProperties;
    
    public RagSearchService(VectorStorageService storageService, 
                           RagIndexingService indexingService,
                           RerankService rerankService,
                           QueryRewriteService queryRewriteService,
                           RerankProperties rerankProperties) {
        this.storageService = storageService;
        this.indexingService = indexingService;
        this.rerankService = rerankService;
        this.queryRewriteService = queryRewriteService;
        this.rerankProperties = rerankProperties;
    }
    
    /**
     * Perform RAG search and return formatted context with sources.
     * Supports optional query rewriting and reranking.
     * 
     * @param query the search query
     * @param topK number of results to return
     * @param rerank whether to enable reranking
     * @param threshold reranking score threshold for filtering
     * @param rewrite whether to enable query rewriting
     * @return RagContextResult containing formatted context, sources, and metadata
     */
    public RagContextResult searchAndAugment(String query, int topK, boolean rerank, double threshold, boolean rewrite) {
        String originalQuery = query;
        boolean queryWasRewritten = false;
        
        logger.info("RAG search: query={}, topK={}, rerank={}, threshold={}, rewrite={}", 
            query, topK, rerank, threshold, rewrite);
        
        // 1. Query rewrite (if enabled)
        if (rewrite) {
            String rewrittenQuery = queryRewriteService.rewrite(query);
            if (!rewrittenQuery.equals(query)) {
                query = rewrittenQuery;
                queryWasRewritten = true;
                logger.info("Query rewritten: '{}' → '{}'", originalQuery, query);
            }
        }
        
        // 2. Generate query embedding
        float[] queryEmbedding = indexingService.generateQueryEmbedding(query);
        
        // 3. Search in vector storage - get more candidates for reranking
        int candidatesToFetch = rerank ? rerankProperties.getTopKBefore() : topK;
        List<SearchResult> candidateResults = storageService.search(queryEmbedding, candidatesToFetch);
        
        logger.info("RAG search: query={}, topK={}, found={} candidates", query, topK, candidateResults.size());
        
        // 4. Reranking flow (if enabled)
        List<SearchResult> finalResults;
        List<Double> rerankScores = null;
        
        if (rerank && !candidateResults.isEmpty()) {
            // Extract document texts for reranking
            List<String> candidateTexts = candidateResults.stream()
                .map(r -> r.getChunk() != null ? r.getChunk().getContent() : "")
                .collect(Collectors.toList());
            
            // Call rerank service
            List<RerankedDocument> rerankedDocs = rerankService.rerank(query, candidateTexts, candidatesToFetch);
            
            logger.info("Reranking {} candidates, {} passed threshold", 
                candidateResults.size(), rerankedDocs.size());
            
            // Filter by threshold and take top K
            int maxResults = Math.min(topK, rerankProperties.getTopKAfter());
            List<RerankedDocument> filteredDocs = rerankedDocs.stream()
                .filter(doc -> doc.getScore() >= threshold)
                .limit(maxResults)
                .collect(Collectors.toList());
            
            // Map back to SearchResult format
            finalResults = new ArrayList<>();
            rerankScores = new ArrayList<>();
            
            for (RerankedDocument doc : filteredDocs) {
                Integer originalIndex = doc.getOriginalIndex();
                if (originalIndex != null && originalIndex >= 0 && originalIndex < candidateResults.size()) {
                    SearchResult originalResult = candidateResults.get(originalIndex);
                    finalResults.add(originalResult);
                    rerankScores.add(doc.getScore());
                }
            }
            
            logger.info("Reranking complete: {} results after threshold={}", finalResults.size(), threshold);
            
        } else {
            // No reranking - use original vector search results
            finalResults = candidateResults.stream()
                .limit(topK)
                .collect(Collectors.toList());
        }
        
        // 5. Format context
        String context = formatContext(finalResults);
        
        // 6. Build sources list
        List<SourceInfo> sources = new ArrayList<>();
        for (int i = 0; i < finalResults.size(); i++) {
            SearchResult result = finalResults.get(i);
            sources.add(new SourceInfo(
                result.getChunk().getSource(),
                result.getChunk().getTitle(),
                result.getChunk().getSection(),
                result.getSimilarity()
            ));
        }
        
        RagContextResult result = new RagContextResult(context, sources, rerankScores, queryWasRewritten);
        logger.info("RAG search complete: query={}, results={}, rerankScores={}, queryWasRewritten={}", 
            query, finalResults.size(), rerankScores != null ? rerankScores.size() : 0, queryWasRewritten);
        
        return result;
    }
    
    /**
     * Legacy method for backward compatibility.
     * Calls the new method with rerank=false, threshold=0.0, rewrite=false.
     */
    public RagContextResult searchAndAugment(String query, int topK) {
        return searchAndAugment(query, topK, false, 0.0, false);
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
        context.append("Use the following context from the knowledge base to answer the user's question.\n\n");
        context.append("INSTRUCTIONS:\n");
        context.append("1. Answer based ONLY on the context below.\n");
        context.append("2. At the end of your answer, add a \"Sources:\" line listing the documents used.\n");
        context.append("3. Format: \"Sources: [document-name] - [section-name]\"\n\n");
        
        for (SearchResult result : results) {
            context.append("[Source: ")
                   .append(result.getChunk().getTitle())
                   .append(", section \"")
                   .append(result.getChunk().getSection())
                   .append("\"]\n");
            context.append(result.getChunk().getContent())
                   .append("\n\n");
        }
        
        return context.toString();
    }
}
