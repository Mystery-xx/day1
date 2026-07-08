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
            
            String content = extractContentFromResponse(response);
            logger.info("AI EXTRACTION RAW RESPONSE: {}", content);
            return content;
            
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
            Ты - экстрактор состояния задачи. Проанализируй диалог и верни ТОЛЬКО JSON.
            
            ПРАВИЛА РАЗДЕЛЕНИЯ GOAL и CONSTRAINTS:
            - GOAL: ЧТО пользователь хочет создать/построить/спроектировать (основная цель)
            - CONSTRAINTS: КАК пользователь хочет это сделать (технические ограничения, "не используй", "только")
            
            ВАЖНО: НЕ включай ограничения в goal! Выноси их в отдельный массив constraints.
            
            Пример 1 (русский):
            Пользователь: "Спроектируй микросервисную архитектуру для интернет-магазина. Не используй монолит, только Java и Spring Boot."
            
            Правильный ответ:
            {
              "goal": "Спроектируй микросервисную архитектуру для интернет-магазина",
              "status": "CLARIFYING",
              "constraints": [
                {"type": "TECHNICAL", "description": "Не используй монолит", "isViolated": false},
                {"type": "TECHNICAL", "description": "Только Java и Spring Boot", "isViolated": false}
              ],
              "clarifications": []
            }
            
            Пример 2 (английский):
            User: "Create a React component for login. Don't use TypeScript, only use PostgreSQL."
            
            Correct answer:
            {
              "goal": "Create a React component for login",
              "status": "CLARIFYING", 
              "constraints": [
                {"type": "TECHNICAL", "description": "Don't use TypeScript", "isViolated": false},
                {"type": "TECHNICAL", "description": "Only use PostgreSQL", "isViolated": false}
              ],
              "clarifications": []
            }
            
            Status definitions:
            - CLARIFYING: AI задаёт вопросы для уточнения требований
            - PLANNING: AI предлагает архитектуру, план, структуру
            - EXECUTING: AI пишет код, создаёт файлы, реализует
            - DONE: Задача завершена, все тесты проходят
            
            Constraints - это технические ограничения: "не используй X", "только Y", "без Z".
            Clarifications - пары вопрос-ответ где AI задал вопрос, пользователь ответил.
            
            Диалог для анализа:
            %s
            
            Верни ТОЛЬКО JSON, без markdown, без объяснений.
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
            logger.debug("RAW AI RESPONSE: {}", response);
            JsonNode root = objectMapper.readTree(response);
            JsonNode choices = root.get("choices");
            if (choices != null && choices.isArray() && choices.size() > 0) {
                JsonNode message = choices.get(0).get("message");
                if (message != null) {
                    JsonNode contentNode = message.get("content");
                    JsonNode reasoningNode = message.get("reasoning");
                    
                    String content = null;
                    
                    // Сначала пробуем content
                    if (contentNode != null && !contentNode.isNull()) {
                        content = contentNode.asText();
                        logger.debug("Using content field");
                    }
                    // Если content null (reasoning model), пробуем reasoning
                    else if (reasoningNode != null && !reasoningNode.isNull()) {
                        content = reasoningNode.asText();
                        logger.debug("Using reasoning field (reasoning model)");
                        // Извлекаем JSON из текста reasoning
                        content = extractJsonFromText(content);
                    }
                    
                    if (content != null) {
                        logger.debug("AI CONTENT BEFORE CLEAN: {}", content);
                        // Удаляем markdown code blocks если есть
                        content = content.replaceAll("```json\\s*", "").replaceAll("```\\s*", "").trim();
                        logger.debug("AI CONTENT AFTER CLEAN: {}", content);
                        return content;
                    }
                }
            }
            logger.error("Invalid AI response format - no choices or message");
            throw new RuntimeException("Invalid AI response format");
        } catch (JsonProcessingException e) {
            logger.error("Failed to parse AI response JSON", e);
            throw new RuntimeException("Failed to parse AI response", e);
        }
    }
    
    /**
     * Извлекает JSON объект из текста (ищет JSON с полем "goal").
     */
    private String extractJsonFromText(String text) {
        if (text == null || text.isEmpty()) {
            return text;
        }
        
        // Ищем JSON который начинается с {"goal": или {"status":
        int start = text.indexOf("{\"goal\":");
        if (start == -1) {
            start = text.indexOf("{\"status\":");
        }
        if (start == -1) {
            // Fallback: ищем первую '{'
            start = text.indexOf('{');
        }
        
        if (start == -1) {
            return text;
        }
        
        // Считаем скобки чтобы найти правильный конец
        int braceCount = 0;
        int end = start;
        
        for (int i = start; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == '{') {
                braceCount++;
            } else if (c == '}') {
                braceCount--;
                if (braceCount == 0) {
                    end = i;
                    break;
                }
            }
        }
        
        String json = text.substring(start, end + 1);
        logger.debug("Extracted JSON from text (length={}): {}...", json.length(), json.substring(0, Math.min(80, json.length())));
        return json;
    }

    /**
     * Парсит AI JSON ответ.
     */
    private void parseAIResponse(String jsonResponse, ExtractionResult result, String currentMessage) {
        try {
            logger.info("PARSING JSON: {}", jsonResponse.substring(0, Math.min(500, jsonResponse.length())));
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
