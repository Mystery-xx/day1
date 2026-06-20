package com.aichat.strategy;

import com.aichat.config.AiChatProperties;
import com.aichat.dto.ChatMessageDTO;
import com.aichat.dto.TaskContext;
import com.aichat.enums.TaskState;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * AI-based transition strategy that uses the AI API to detect state transitions.
 * Analyzes user messages and task context to determine when to transition between states.
 */
@Component
public class AiTransitionStrategy implements TransitionStrategy {
    
    private static final Logger logger = LoggerFactory.getLogger(AiTransitionStrategy.class);
    
    private final AiChatProperties properties;
    private final WebClient webClient;
    
    // Confirmation phrases for detecting transition intent
    private static final Set<String> CONFIRMATION_PHRASES = Set.of(
        "ПОДТВЕРДИЛ",
        "ГОТОВ ПЕРЕЙТИ",
        "МОЖНО ПЕРЕХОДИТЬ",
        "ПРИСТУПАЮ",
        "ДА"
    );
    
    public AiTransitionStrategy(AiChatProperties properties) {
        this.properties = properties;
        
        HttpClient httpClient = HttpClient.create()
                .responseTimeout(Duration.ofSeconds(30));
        
        this.webClient = WebClient.builder()
                .baseUrl(properties.getProviderBaseUrl())
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .build();
    }
    
    @Override
    public Optional<TaskState> detectTransition(TaskContext context, ChatMessageDTO message, TaskState currentState) {
        if (message == null || message.getContent() == null) {
            return Optional.empty();
        }
        
        return switch (currentState) {
            case PLANNING -> detectPlanningToExecution(context, message);
            case EXECUTION -> detectExecutionToValidation(context, message);
            case VALIDATION -> detectValidationTransition(context, message);
            case DONE -> detectDoneTransition(context, message);
        };
    }
    
    /**
     * Detect transition from PLANNING to EXECUTION using AI.
     */
    private Optional<TaskState> detectPlanningToExecution(TaskContext context, ChatMessageDTO message) {
        String systemPrompt = """
            Ты определяешь готовность пользователя перейти от планирования к реализации. Анализируй сообщение и контекст.
            Если пользователь готов перейти к реализации, ответь ДА. Если нужны уточнения или план не утвержден, ответь НЕТ.
            Ответь ТОЛЬКО одним словом: ДА или НЕТ. Никаких объяснений.
            """;
        
        String plan = context.getApprovedPlan() != null ? context.getApprovedPlan() : "(план еще не сформирован)";
        String userPrompt = "Пользователь написал: " + message.getContent() + ". План: " + plan + ". Готов ли пользователь перейти к реализации? Ответь ТОЛЬКО ДА или НЕТ.";
        
        return callAiAndDetectTransition(systemPrompt, userPrompt, TaskState.EXECUTION, message.getContent());
    }
    
    /**
     * Detect transition from EXECUTION to VALIDATION using AI.
     */
    private Optional<TaskState> detectExecutionToValidation(TaskContext context, ChatMessageDTO message) {
        String systemPrompt = """
            Ты определяешь готовность перехода от реализации к валидации. Анализируй полноту реализации и сообщение пользователя.
            Если реализация завершена и пользователь готов к валидации, ответь ДА. Если нужны доработки, ответь НЕТ.
            Ответь ТОЛЬКО одним словом: ДА или НЕТ. Никаких объяснений.
            """;
        
        String plan = context.getApprovedPlan() != null ? context.getApprovedPlan() : "(план не утвержден)";
        String implementation = context.getImplementation() != null ? context.getImplementation() : "(реализация отсутствует)";
        String userPrompt = "План: " + plan + ". Реализация: " + implementation + ". Пользователь написал: " + message.getContent() + ". Готов ли пользователь перейти к валидации? Ответь ТОЛЬКО ДА или НЕТ.";
        
        return callAiAndDetectTransition(systemPrompt, userPrompt, TaskState.VALIDATION, message.getContent());
    }
    
    /**
     * Detect transition from VALIDATION to DONE or PLANNING using AI.
     */
    private Optional<TaskState> detectValidationTransition(TaskContext context, ChatMessageDTO message) {
        String systemPrompt = """
            Ты определяешь результат валидации. Если пользователь доволен и задача завершена, ответь DONE.
            Если нужны доработки или уточнения, ответь PLANNING. Если нужно продолжить реализацию, ответь EXECUTION.
            Ответь ТОЛЬКО одним словом: DONE, PLANNING или EXECUTION. Никаких объяснений.
            """;
        
        String implementation = context.getImplementation() != null ? context.getImplementation() : "(реализация отсутствует)";
        String userPrompt = "Реализация: " + implementation + ". Пользователь написал: " + message.getContent() + ". Какой следующий шаг? Ответь ТОЛЬКО DONE, PLANNING или EXECUTION.";
        
        try {
            String aiResponse = callAiApi(systemPrompt, userPrompt);
            if (aiResponse != null) {
                String upperResponse = aiResponse.toUpperCase();
                if (upperResponse.contains("DONE")) {
                    logger.info("AI detected transition VALIDATION → DONE");
                    return Optional.of(TaskState.DONE);
                } else if (upperResponse.contains("PLANNING")) {
                    logger.info("AI detected transition VALIDATION → PLANNING");
                    return Optional.of(TaskState.PLANNING);
                } else if (upperResponse.contains("EXECUTION")) {
                    logger.info("AI detected transition VALIDATION → EXECUTION");
                    return Optional.of(TaskState.EXECUTION);
                }
            }
        } catch (Exception e) {
            logger.error("Error calling AI API for validation transition", e);
        }
        
        // Fallback to keyword detection
        return fallbackValidationTransition(message.getContent());
    }
    
    /**
     * Detect transition from DONE to PLANNING (new requirements).
     */
    private Optional<TaskState> detectDoneTransition(TaskContext context, ChatMessageDTO message) {
        String systemPrompt = """
            Ты определяешь нужны ли новые требования к завершенной задаче. Если пользователь хочет добавить функционал или изменить задачу, ответь PLANNING.
            Если задача полностью завершена и изменений не требуется, ответь NONE.
            Ответь ТОЛЬКО одним словом: PLANNING или NONE. Никаких объяснений.
            """;
        
        String userPrompt = "Пользователь написал: " + message.getContent() + ". Нужны ли новые требования или изменения? Ответь ТОЛЬКО PLANNING или NONE.";
        
        try {
            String aiResponse = callAiApi(systemPrompt, userPrompt);
            if (aiResponse != null && aiResponse.toUpperCase().contains("PLANNING")) {
                logger.info("AI detected transition DONE → PLANNING");
                return Optional.of(TaskState.PLANNING);
            }
        } catch (Exception e) {
            logger.error("Error calling AI API for done transition", e);
        }
        
        // Fallback to keyword detection
        String lowerContent = message.getContent().toLowerCase();
        if (lowerContent.contains("нужно дополнить") || 
            lowerContent.contains("добавить функцию") || 
            lowerContent.contains("хочу ещё") ||
            lowerContent.contains("изменить") ||
            lowerContent.contains("новая задача")) {
            return Optional.of(TaskState.PLANNING);
        }
        
        return Optional.empty();
    }
    
    /**
     * Call AI API and detect transition based on response.
     */
    private Optional<TaskState> callAiAndDetectTransition(String systemPrompt, String userPrompt, 
                                                           TaskState targetState, String fallbackMessage) {
        try {
            String aiResponse = callAiApi(systemPrompt, userPrompt);
            
            if (aiResponse != null) {
                boolean shouldTransition = detectConfirmation(aiResponse);
                logger.info("AI detected transition intent: {} (content='{}')", shouldTransition, aiResponse);
                
                if (shouldTransition) {
                    return Optional.of(targetState);
                }
            }
        } catch (Exception e) {
            logger.error("Error calling AI API for transition detection", e);
        }
        
        // Fallback to keyword detection
        return fallbackKeywordDetection(fallbackMessage, targetState);
    }
    
    /**
     * Call AI API with system and user prompts.
     */
    private String callAiApi(String systemPrompt, String userPrompt) {
        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("model", properties.getModel());
        requestBody.put("messages", List.of(
            Map.of("role", "system", "content", systemPrompt),
            Map.of("role", "user", "content", userPrompt)
        ));
        requestBody.put("stream", false);
        requestBody.put("max_tokens", 10);
        
        String apiKey = properties.getKey();
        
        logger.debug("Transition detection AI request: {}", requestBody);
        
        Map<String, Object> response = webClient.post()
                .uri("/chat/completions")
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                .bodyValue(requestBody)
                .retrieve()
                .bodyToMono(Map.class)
                .block(Duration.ofSeconds(30));
        
        logger.info("Transition detection - FULL AI response: {}", response);
        
        if (response != null) {
            Object choicesObj = response.get("choices");
            logger.info("Transition detection - choices field: {} (type: {})", 
                choicesObj, choicesObj != null ? choicesObj.getClass().getSimpleName() : "null");
            
            if (choicesObj instanceof List) {
                List<Map<String, Object>> choices = (List<Map<String, Object>>) choicesObj;
                
                if (!choices.isEmpty()) {
                    Object messageObj = choices.get(0).get("message");
                    logger.info("Transition detection - message field: {} (type: {})", 
                        messageObj, messageObj != null ? messageObj.getClass().getSimpleName() : "null");
                    
                    if (messageObj instanceof Map) {
                        Map<String, Object> aiMessage = (Map<String, Object>) messageObj;
                        
                        Object contentObj = aiMessage.get("content");
                        logger.info("Transition detection - content field: {} (type: {})", 
                            contentObj, contentObj != null ? contentObj.getClass().getSimpleName() : "null");
                        
                        String content = contentObj != null ? contentObj.toString() : null;
                        
                        // Check reasoning field when content is null (for reasoning models like Qwen3.5)
                        if (content == null) {
                            Object reasoningObj = aiMessage.get("reasoning");
                            String reasoning = reasoningObj != null ? reasoningObj.toString() : null;
                            logger.info("Transition detection - reasoning field: '{}'", reasoning);
                            content = reasoning;
                        }
                        
                        if (content == null) {
                            logger.warn("Transition detection - AI returned null content. Full response: {}", response);
                        }
                        
                        return content;
                    }
                }
            }
        }
        
        return null;
    }
    
    /**
     * Detect confirmation phrases in AI response.
     */
    private boolean detectConfirmation(String content) {
        if (content == null || content.trim().isEmpty()) {
            return false;
        }
        
        String upperContent = content.toUpperCase();
        
        for (String phrase : CONFIRMATION_PHRASES) {
            if (upperContent.contains(phrase)) {
                logger.info("Confirmation phrase detected: '{}'", phrase);
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Fallback keyword detection for planning to execution transition.
     */
    private Optional<TaskState> fallbackKeywordDetection(String message, TaskState targetState) {
        if (message == null) {
            return Optional.empty();
        }
        
        String lower = message.toLowerCase();
        boolean detected = switch (targetState) {
            case EXECUTION -> lower.contains("согласен") || 
                            lower.contains("утверждаю") || 
                            lower.contains("план хороший") ||
                            lower.contains("ok") ||
                            lower.contains("окей") ||
                            lower.contains("приступаю") ||
                            lower.contains("делай") ||
                            lower.contains("выполняй") ||
                            lower.contains("реализуй") ||
                            lower.contains("внедряй") ||
                            lower.contains("запускай");
            case VALIDATION -> lower.contains("готово") || 
                              lower.contains("завершено") || 
                              lower.contains("закончил") ||
                              lower.contains("сделал") ||
                              lower.contains("проверяй") ||
                              lower.contains("валидация") ||
                              lower.contains("тест") ||
                              lower.contains("тестирование");
            default -> false;
        };
        
        logger.info("Keyword detection result: {} for target state {}", detected, targetState);
        return detected ? Optional.of(targetState) : Optional.empty();
    }
    
    /**
     * Fallback keyword detection for validation transitions.
     */
    private Optional<TaskState> fallbackValidationTransition(String message) {
        if (message == null) {
            return Optional.empty();
        }
        
        String lower = message.toLowerCase();
        
        // Check for DONE
        if (lower.contains("доволен") || 
            lower.contains("всё готово") || 
            lower.contains("принято") ||
            lower.contains("одобряю") ||
            lower.contains("отлично") ||
            lower.contains("прекрасно")) {
            return Optional.of(TaskState.DONE);
        }
        
        // Check for PLANNING (revision needed)
        if (lower.contains("не доволен") || 
            lower.contains("нужно уточнить") || 
            lower.contains("ошибка") ||
            lower.contains("проблема") ||
            lower.contains("исправь") ||
            lower.contains("переделай") ||
            lower.contains("неверно") ||
            lower.contains("неправильно")) {
            return Optional.of(TaskState.PLANNING);
        }
        
        return Optional.empty();
    }
}
