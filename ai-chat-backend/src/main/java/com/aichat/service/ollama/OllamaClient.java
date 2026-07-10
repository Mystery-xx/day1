package com.aichat.service.ollama;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import jakarta.annotation.PostConstruct;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Mono;
import reactor.netty.http.client.HttpClient;
import reactor.util.retry.Retry;

import java.time.Duration;
import java.util.List;

@Service
public class OllamaClient {
    
    private static final Logger logger = LoggerFactory.getLogger(OllamaClient.class);
    
    @Value("${rag.ollama.base-url:http://host.docker.internal:11434}")
    private String ollamaBaseUrl;
    
    private WebClient webClient;
    private static final int MAX_RETRIES = 3;
    private static final Duration TIMEOUT = Duration.ofSeconds(30);
    private static final Duration CHAT_TIMEOUT = Duration.ofSeconds(180);
    
    @PostConstruct
    public void init() {
        HttpClient httpClient = HttpClient.create()
                .responseTimeout(TIMEOUT);
        
        this.webClient = WebClient.builder()
            .baseUrl(ollamaBaseUrl)
            .clientConnector(new org.springframework.http.client.reactive.ReactorClientHttpConnector(httpClient))
            .build();
    }
    
    /**
     * Generate embedding for the given text using the specified model.
     * Implements retry logic with exponential backoff (3 attempts) and 30s timeout.
     * 
     * @param text the text to generate embedding for
     * @param model the model name to use (e.g., "nomic-embed-text")
     * @return float array containing the embedding vector
     * @throws OllamaUnavailableException if Ollama service is unreachable
     * @throws ModelNotFoundException if the specified model is not found
     */
    public float[] generateEmbedding(String text, String model) {
        EmbedRequest request = new EmbedRequest(model, text);
        
        try {
            EmbedResponse response = webClient.post()
                .uri("/api/embed")
                .bodyValue(request)
                .retrieve()
                .bodyToMono(EmbedResponse.class)
                .timeout(TIMEOUT)
                .retryWhen(Retry.backoff(MAX_RETRIES, Duration.ofSeconds(1))
                    .maxBackoff(Duration.ofSeconds(10))
                    .transientErrors(true)
                    .onRetryExhaustedThrow((spec, signal) -> {
                        logger.error("Max retries ({}) exhausted for Ollama embedding request", MAX_RETRIES);
                        return new OllamaUnavailableException("Failed to connect to Ollama after " + MAX_RETRIES + " attempts");
                    }))
                .doOnError(throwable -> {
                    if (throwable instanceof WebClientResponseException.NotFound) {
                        logger.error("Model '{}' not found in Ollama", model);
                        throw new ModelNotFoundException(model, throwable);
                    } else if (throwable instanceof WebClientResponseException) {
                        logger.error("Ollama API error: {}", ((WebClientResponseException) throwable).getStatusCode());
                        throw new OllamaUnavailableException("Ollama API error: " + ((WebClientResponseException) throwable).getStatusCode());
                    } else {
                        logger.error("Ollama connection error: {}", throwable.getMessage());
                        throw new OllamaUnavailableException("Failed to connect to Ollama: " + throwable.getMessage(), throwable);
                    }
                })
                .block();
            
            if (response == null || response.getEmbeddings() == null || response.getEmbeddings().length == 0) {
                throw new OllamaUnavailableException("Empty response from Ollama");
            }
            
            return response.getEmbeddings()[0];
            
        } catch (ModelNotFoundException e) {
            throw e;
        } catch (OllamaUnavailableException e) {
            throw e;
        } catch (Exception e) {
            logger.error("Unexpected error during embedding generation", e);
            throw new OllamaUnavailableException("Unexpected error: " + e.getMessage(), e);
        }
    }
    
    /**
     * Generate chat response using the Ollama chat API.
     * Implements retry logic with exponential backoff (3 attempts) and 180s timeout.
     * 
     * @param messages the conversation messages
     * @param model the model name to use (e.g., "llama3.2")
     * @return OllamaChatResponse containing the AI response
     * @throws OllamaUnavailableException if Ollama service is unreachable
     * @throws ModelNotFoundException if the specified model is not found
     */
    public OllamaChatResponse chat(List<OllamaChatRequest.Message> messages, String model) {
        OllamaChatRequest request = new OllamaChatRequest(model, messages, false);
        
        try {
            OllamaChatResponse response = webClient.post()
                .uri("/api/chat")
                .bodyValue(request)
                .retrieve()
                .bodyToMono(OllamaChatResponse.class)
                .timeout(CHAT_TIMEOUT)
                .retryWhen(Retry.backoff(MAX_RETRIES, Duration.ofSeconds(1))
                    .maxBackoff(Duration.ofSeconds(10))
                    .transientErrors(true)
                    .onRetryExhaustedThrow((spec, signal) -> {
                        logger.error("Max retries ({}) exhausted for Ollama chat request", MAX_RETRIES);
                        return new OllamaUnavailableException("Failed to connect to Ollama after " + MAX_RETRIES + " attempts");
                    }))
                .doOnError(throwable -> {
                    if (throwable instanceof WebClientResponseException.NotFound) {
                        logger.error("Model '{}' not found in Ollama", model);
                        throw new ModelNotFoundException(model, throwable);
                    } else if (throwable instanceof WebClientResponseException) {
                        logger.error("Ollama API error: {}", ((WebClientResponseException) throwable).getStatusCode());
                        throw new OllamaUnavailableException("Ollama API error: " + ((WebClientResponseException) throwable).getStatusCode());
                    } else {
                        logger.error("Ollama connection error: {}", throwable.getMessage());
                        throw new OllamaUnavailableException("Failed to connect to Ollama: " + throwable.getMessage(), throwable);
                    }
                })
                .block();
            
            if (response == null || response.getMessage() == null || response.getMessage().getContent() == null) {
                throw new OllamaUnavailableException("Empty response from Ollama");
            }
            
            return response;
            
        } catch (ModelNotFoundException e) {
            throw e;
        } catch (OllamaUnavailableException e) {
            throw e;
        } catch (Exception e) {
            logger.error("Unexpected error during chat generation", e);
            throw new OllamaUnavailableException("Unexpected error: " + e.getMessage(), e);
        }
    }
    
    /**
     * Request DTO for Ollama embedding API.
     */
    public static class EmbedRequest {
        private String model;
        private String input;
        
        public EmbedRequest() {
            // Default constructor for JSON deserialization
        }
        
        public EmbedRequest(String model, String input) {
            this.model = model;
            this.input = input;
        }
        
        public String getModel() {
            return model;
        }
        
        public void setModel(String model) {
            this.model = model;
        }
        
        public String getInput() {
            return input;
        }
        
        public void setInput(String input) {
            this.input = input;
        }
    }
    
    /**
     * Response DTO for Ollama embedding API.
     */
    public static class EmbedResponse {
        private float[][] embeddings;
        
        public EmbedResponse() {
            // Default constructor for JSON deserialization
        }
        
        public float[][] getEmbeddings() {
            return embeddings;
        }
        
        public void setEmbeddings(float[][] embeddings) {
            this.embeddings = embeddings;
        }
    }
}
