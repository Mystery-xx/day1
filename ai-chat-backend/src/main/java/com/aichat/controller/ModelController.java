package com.aichat.controller;

import com.aichat.dto.ModelInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@CrossOrigin(originPatterns = "*", allowCredentials = "true")
public class ModelController {

    private static final Logger logger = LoggerFactory.getLogger(ModelController.class);

    @Value("${ollama.api-url:http://host.docker.internal:11434}")
    private String ollamaBaseUrl;

    @GetMapping("/models/local")
    public Mono<ResponseEntity<List<ModelInfo>>> getLocalModels() {
        logger.info("Fetching local Ollama models");
        
        WebClient ollamaClient = WebClient.builder()
                .baseUrl(ollamaBaseUrl)
                .build();
        
        return ollamaClient.get()
                .uri("/api/tags")
                .retrieve()
                .bodyToMono(Map.class)
                .map(response -> {
                    List<ModelInfo> models = new ArrayList<>();
                    Object modelsObj = response.get("models");
                    if (modelsObj instanceof List) {
                        List<?> modelsList = (List<?>) modelsObj;
                        for (Object item : modelsList) {
                            if (item instanceof Map) {
                                Map<String, Object> modelData = (Map<String, Object>) item;
                                String modelName = (String) modelData.get("name");
                                if (modelName != null) {
                                    ModelInfo modelInfo = new ModelInfo();
                                    modelInfo.setId(modelName);
                                    modelInfo.setName(modelName);
                                    Object size = modelData.get("size");
                                    if (size instanceof Number) {
                                        modelInfo.setSize(((Number) size).longValue());
                                    }
                                    modelInfo.setCategory("text-generation");
                                    models.add(modelInfo);
                                }
                            }
                        }
                    }
                    logger.info("Found {} local Ollama models", models.size());
                    return ResponseEntity.ok(models);
                })
                .onErrorResume(e -> {
                    logger.error("Failed to fetch local Ollama models: {}", e.getMessage());
                    return Mono.just(ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(new ArrayList<ModelInfo>()));
                });
    }
}