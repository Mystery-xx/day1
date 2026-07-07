package com.aichat.service.rerank;

import com.aichat.dto.rerank.RerankRequest;
import com.aichat.dto.rerank.RerankResponse;
import com.aichat.dto.rerank.RerankResponse.RerankResult;
import com.aichat.dto.rerank.RerankedDocument;
import org.springframework.core.ParameterizedTypeReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.netty.http.client.HttpClient;

import jakarta.annotation.PostConstruct;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Service for calling Text Embeddings Interface (TEI) reranking endpoint.
 * Reranks a list of documents based on their relevance to a query.
 * 
 * TODO: Add caching for frequently reranked queries (future optimization)
 */
@Service
public class RerankService {

    private static final Logger logger = LoggerFactory.getLogger(RerankService.class);

    @Value("${rag.rerank.base-url:http://tei-reranker:80}")
    private String rerankBaseUrl;

    private WebClient webClient;

    private static final Duration TIMEOUT = Duration.ofSeconds(15);

    @PostConstruct
    public void init() {
        HttpClient httpClient = HttpClient.create()
                .responseTimeout(TIMEOUT);

        this.webClient = WebClient.builder()
                .baseUrl(rerankBaseUrl)
                .clientConnector(new org.springframework.http.client.reactive.ReactorClientHttpConnector(httpClient))
                .build();
    }

    /**
     * Rerank a list of documents based on their relevance to a query.
     * Calls the TEI /rerank endpoint and returns documents sorted by relevance score.
     * On TEI failure (timeout, connection error), returns original documents as fallback.
     * 
     * @param query the search query
     * @param documents list of document texts to rerank
     * @param topN maximum number of top results to return
     * @return list of reranked documents sorted by relevance score (highest first),
     *         or original documents with score 0.0 on TEI failure
     */
    public List<RerankedDocument> rerank(String query, List<String> documents, int topN) {
        if (query == null || query.isBlank() || documents == null || documents.isEmpty()) {
            logger.warn("Rerank called with empty query or documents");
            return Collections.emptyList();
        }

        int docCount = documents.size();
        
        try {
            RerankRequest request = new RerankRequest(query, documents, topN);

            logger.debug("Reranking {} documents for query: {}", docCount, query);

            // TEI returns raw JSON array: [{index:0, score:0.9}, ...]
            // Deserialize directly to List<RerankResult> instead of wrapped RerankResponse
            List<RerankResult> results = webClient.post()
                    .uri("/rerank")
                    .bodyValue(request)
                    .retrieve()
                    .bodyToMono(new ParameterizedTypeReference<List<RerankResult>>() {})
                    .timeout(TIMEOUT)
                    .doOnError(throwable -> {
                        if (throwable instanceof java.util.concurrent.TimeoutException) {
                            logger.warn("TEI rerank timeout after {}s - using baseline search", TIMEOUT.getSeconds());
                        } else if (throwable instanceof WebClientResponseException) {
                            logger.warn("TEI rerank API error: {} - using baseline search", ((WebClientResponseException) throwable).getStatusCode());
                        } else {
                            logger.warn("TEI rerank connection error: {} - using baseline search", throwable.getMessage());
                        }
                    })
                    .block();

            if (results == null || results.isEmpty()) {
                logger.warn("Empty response from TEI rerank endpoint - using baseline search");
                return createBaselineResults(documents);
            }

            logger.info("Reranking {} documents, TEI response: {} scores", docCount, results.size());

            // Convert TEI results to RerankedDocument objects
            List<RerankedDocument> rerankedDocs = new ArrayList<>();
            for (RerankResult result : results) {
                Integer index = result.getIndex();
                String originalText = (index != null && index < documents.size()) 
                    ? documents.get(index) 
                    : "";
                
                RerankedDocument doc = RerankedDocument.of(
                    originalText,
                    result.getScore(),
                    index
                );
                rerankedDocs.add(doc);
            }

            return rerankedDocs;

        } catch (Exception e) {
            // Check for timeout (reactor wraps TimeoutException in IllegalStateException)
            boolean isTimeout = e instanceof java.util.concurrent.TimeoutException || 
                               (e.getMessage() != null && e.getMessage().contains("timeout"));
            
            if (isTimeout) {
                logger.warn("Reranker service unavailable (timeout), using baseline search");
            } else if (e instanceof WebClientResponseException) {
                logger.warn("Reranker service unavailable (HTTP {}), using baseline search", ((WebClientResponseException) e).getStatusCode());
            } else {
                logger.warn("Reranker service unavailable ({}), using baseline search", e.getMessage());
            }
            return createBaselineResults(documents);
        }
    }

    /**
     * Create baseline results from original documents when TEI is unavailable.
     * Returns documents in original order with score 0.0.
     * 
     * @param documents original document texts
     * @return list of RerankedDocument with score 0.0 for each document
     */
    private List<RerankedDocument> createBaselineResults(List<String> documents) {
        List<RerankedDocument> baselineDocs = new ArrayList<>();
        for (int i = 0; i < documents.size(); i++) {
            baselineDocs.add(RerankedDocument.of(documents.get(i), 0.0, i));
        }
        return baselineDocs;
    }
}
