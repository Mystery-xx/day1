package com.aichat.service;

import com.aichat.dto.ClarificationDTO;
import com.aichat.dto.ConstraintDTO;
import com.aichat.entity.TaskStatus;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Сервис для автоматического извлечения состояния задачи из диалога с пользователем.
 * Использует AI/LLM для интеллектуального извлечения: goal, status, constraints, clarifications.
 */
@Service
public class TaskStateExtractionStrategy {

    private static final Logger logger = LoggerFactory.getLogger(TaskStateExtractionStrategy.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final WebClient webClient;

    @Value("${ai.api.url:}")
    private String aiApiUrl;

    @Value("${ai.api.key:}")
    private String aiApiKey;

    @Value("${ai.model:}")
    private String aiModel;

    @Value("${taskstate.extraction.model:}")
    private String extractionModel;

    public TaskStateExtractionStrategy() {
        this.webClient = WebClient.builder().build();
    }

    /**
     * Результат извлечения состояния задачи.
     */
    public static class ExtractionResult {
        private String goal;
        private TaskStatus status;
        private List<ConstraintDTO> constraints;
        private List<ClarificationDTO> clarifications;

        public ExtractionResult() {
            this.constraints = new ArrayList<>();
            this.clarifications = new ArrayList<>();
        }

        public String getGoal() {
            return goal;
        }

        public void setGoal(String goal) {
            this.goal = goal;
        }

        public TaskStatus getStatus() {
            return status;
        }

        public void setStatus(TaskStatus status) {
            this.status = status;
        }

        public List<ConstraintDTO> getConstraints() {
            return constraints;
        }

        public void setConstraints(List<ConstraintDTO> constraints) {
            this.constraints = constraints;
        }

        public List<ClarificationDTO> getClarifications() {
            return clarifications;
        }

        public void setClarifications(List<ClarificationDTO> clarifications) {
            this.clarifications = clarifications;
        }
    }

    /**
     * Извлекает состояние задачи из истории диалога и текущего сообщения.
     * Использует AI/LLM для интеллектуального извлечения.
     */
    public ExtractionResult extractTaskState(String conversationHistory, String currentMessage) {
        logger.debug("Extracting task state from conversation history (length={}) and current message (length={})",
                conversationHistory != null ? conversationHistory.length() : 0,
                currentMessage != null ? currentMessage.length() : 0);

        ExtractionResult result = new ExtractionResult();

        try {
            // Формируем контекст для AI
            String context = buildContext(conversationHistory, currentMessage);
            
            // Вызываем AI для извлечения TaskState
            String aiResponse = callExtractionAI(context);
            
            // Парсим JSON ответ
            parseAIResponse(aiResponse, result, currentMessage);
            
        } catch (Exception e) {
            logger.error("Failed to extract TaskState using AI, falling back to basic extraction", e);
            // Fallback к базовому извлечению
            fallbackExtraction(result, conversationHistory, currentMessage);
        }

        logger.info("Task state extracted: goal='{}', status={}, constraints={}, clarifications={}",
                result.getGoal(), result.getStatus(),
                result.getConstraints().size(), result.getClarifications().size());

        return result;
    }

    /**
     * Формирует контекст для AI extraction.
     */
    private String buildContext(String conversationHistory, String currentMessage) {
        StringBuilder context = new StringBuilder();
        
        if (conversationHistory != null && !conversationHistory.trim().isEmpty()) {
            context.append("Conversation History:\n");
            context.append(conversationHistory);
            context.append("\n\n");
        }
        
        if (currentMessage != null && !currentMessage.trim().isEmpty()) {
            context.append("Current Message: ");
            context.append(currentMessage);
        }
        
        return context.toString();
    }

    /**
     * Вызывает AI API для извлечения TaskState.
     */
    private String callExtractionAI(String context) {
        String prompt = buildExtractionPrompt(context);
        
        logger.debug("Calling AI for TaskState extraction");
        
        try {
            String response = webClient.post()
                .uri(aiApiUrl + "/chat/completions")
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + aiApiKey)
                .bodyValue(buildRequestBody(prompt))
                .retrieve()
                .bodyToMono(String.class)
                .block();
            
            logger.debug("AI extraction response received");
            return extractContentFromResponse(response);
            
        } catch (Exception e) {
            logger.error("AI extraction call failed", e);
            throw new RuntimeException("Failed to call AI for TaskState extraction", e);
        }
    }

    /**
     * Строит prompt для AI extraction.
     */
    private String buildExtractionPrompt(String context) {
        return """
            Analyze the conversation and extract the task state. Return ONLY valid JSON in this exact format:
            
            {
              "goal": "The main goal/task the user wants to accomplish",
              "status": "CLARIFYING|PLANNING|EXECUTING|DONE",
              "constraints": [
                {"type": "TECHNICAL", "description": "constraint description", "isViolated": false}
              ],
              "clarifications": [
                {"question": "question asked by AI", "answer": "user's answer", "timestamp": "ISO-8601"}
              ]
            }
            
            Status definitions:
            - CLARIFYING: AI is asking questions to understand requirements
            - PLANNING: AI is proposing architecture, plan, or structure
            - EXECUTING: AI is writing code, creating files, implementing
            - DONE: Task is complete, all tests passing
            
            Constraints are technical limitations mentioned by user (e.g., "don't use monolith", "only use React").
            Clarifications are Q&A pairs where AI asked a question and user answered.
            
            Conversation to analyze:
            %s
            
            Return ONLY JSON, no markdown, no explanations.
            """.formatted(context);
    }

    /**
     * Строит request body для AI API.
     */
    private Object buildRequestBody(String prompt) {
        String modelToUse = extractionModel != null && !extractionModel.isEmpty() ? extractionModel : aiModel;
        
        return java.util.Map.of(
            "model", modelToUse,
            "messages", java.util.List.of(
                java.util.Map.of("role", "user", "content", prompt)
            ),
            "temperature", 0.3,
            "max_tokens", 1000
        );
    }

    /**
     * Извлекает content из AI response.
     */
    private String extractContentFromResponse(String response) {
        try {
            JsonNode root = objectMapper.readTree(response);
            JsonNode choices = root.get("choices");
            if (choices != null && choices.isArray() && choices.size() > 0) {
                JsonNode message = choices.get(0).get("message");
                if (message != null) {
                    String content = message.get("content").asText();
                    // Удаляем markdown code blocks если есть
                    content = content.replaceAll("```json\\s*", "").replaceAll("```\\s*", "").trim();
                    return content;
                }
            }
            throw new RuntimeException("Invalid AI response format");
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to parse AI response", e);
        }
    }

    /**
     * Парсит AI JSON ответ.
     */
    private void parseAIResponse(String jsonResponse, ExtractionResult result, String currentMessage) {
        try {
            JsonNode root = objectMapper.readTree(jsonResponse);
            
            // Goal
            JsonNode goalNode = root.get("goal");
            if (goalNode != null && !goalNode.asText().isEmpty()) {
                result.setGoal(goalNode.asText().trim());
            } else if (currentMessage != null && !currentMessage.trim().isEmpty()) {
                // Fallback: используем currentMessage как goal
                result.setGoal(currentMessage.trim());
            }
            
            // Status
            JsonNode statusNode = root.get("status");
            if (statusNode != null) {
                try {
                    result.setStatus(TaskStatus.valueOf(statusNode.asText().toUpperCase()));
                } catch (IllegalArgumentException e) {
                    logger.warn("Invalid status from AI: {}, defaulting to CLARIFYING", statusNode.asText());
                    result.setStatus(TaskStatus.CLARIFYING);
                }
            } else {
                result.setStatus(TaskStatus.CLARIFYING);
            }
            
            // Constraints
            JsonNode constraintsNode = root.get("constraints");
            if (constraintsNode != null && constraintsNode.isArray()) {
                List<ConstraintDTO> constraints = new ArrayList<>();
                String goal = result.getGoal();
                
                for (JsonNode constraintNode : constraintsNode) {
                    String description = constraintNode.has("description") ? 
                        constraintNode.get("description").asText() : "";
                    String type = constraintNode.has("type") ? 
                        constraintNode.get("type").asText() : "TECHNICAL";
                    boolean isViolated = constraintNode.has("isViolated") && 
                        constraintNode.get("isViolated").asBoolean(false);
                    
                    // Пропускаем если описание пустое или дублирует goal
                    if (!description.isEmpty() && 
                        (goal == null || goal.isEmpty() || !goal.toLowerCase().contains(description.toLowerCase()))) {
                        ConstraintDTO constraint = new ConstraintDTO();
                        constraint.setType(type);
                        constraint.setDescription(description);
                        constraint.setIsViolated(isViolated);
                        constraints.add(constraint);
                        logger.debug("Extracted constraint: {}: {}", type, description);
                    }
                }
                
                result.setConstraints(constraints);
            }
            
            // Clarifications
            JsonNode clarificationsNode = root.get("clarifications");
            if (clarificationsNode != null && clarificationsNode.isArray()) {
                List<ClarificationDTO> clarifications = new ArrayList<>();
                
                for (JsonNode clarificationNode : clarificationsNode) {
                    String question = clarificationNode.has("question") ? 
                        clarificationNode.get("question").asText() : "";
                    String answer = clarificationNode.has("answer") ? 
                        clarificationNode.get("answer").asText() : "";
                    
                    if (!question.isEmpty() && !answer.isEmpty()) {
                        String timestampStr = clarificationNode.has("timestamp") ? 
                            clarificationNode.get("timestamp").asText() : null;
                        Instant timestamp = timestampStr != null ? 
                            Instant.parse(timestampStr) : Instant.now();
                        
                        clarifications.add(new ClarificationDTO(question, answer, timestamp));
                        logger.debug("Extracted clarification Q&A: Q='{}' A='{}'", question, answer);
                    }
                }
                
                result.setClarifications(clarifications);
            }
            
        } catch (JsonProcessingException e) {
            logger.error("Failed to parse AI JSON response: {}", jsonResponse, e);
            throw new RuntimeException("Invalid JSON from AI", e);
        }
    }

    /**
     * Fallback extraction если AI вызов не удался.
     */
    private void fallbackExtraction(ExtractionResult result, String conversationHistory, String currentMessage) {
        logger.debug("Using fallback extraction");
        
        // Goal из currentMessage или первого сообщения пользователя
        if (currentMessage != null && !currentMessage.trim().isEmpty()) {
            result.setGoal(currentMessage.trim());
        } else if (conversationHistory != null) {
            String[] lines = conversationHistory.split("\n");
            for (String line : lines) {
                if (line.trim().startsWith("User:") || line.trim().startsWith("Пользователь:")) {
                    String message = line.replaceFirst("^(User:|Пользователь:)", "").trim();
                    if (!message.isEmpty()) {
                        result.setGoal(message);
                        break;
                    }
                }
            }
        }
        
        // Status по умолчанию
        result.setStatus(TaskStatus.CLARIFYING);
        
        // Constraints и clarifications остаются пустыми
    }
}
