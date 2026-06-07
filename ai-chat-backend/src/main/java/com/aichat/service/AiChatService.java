package com.aichat.service;

import com.aichat.config.AiChatProperties;
import com.aichat.dto.ChatRequest;
import com.aichat.dto.ChatResponse;
import com.aichat.dto.Reservation;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import reactor.core.publisher.Mono;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class AiChatService {

    private static final Logger logger = LoggerFactory.getLogger(AiChatService.class);

    private final WebClient webClient;
    private final AiChatProperties properties;
    private final ObjectMapper objectMapper;

    private static final String SYSTEM_PROMPT_TEMPLATE = """
            Ты помощник для бронирования столиков в ресторане.
            Твоя задача - извлекать из диалога данные для заказа:
            - restaurantAddress: адрес ресторана
            - date: дата в формате YYYY-MM-DD
            - time: время в формате HH:MM
            - numberOfGuests: количество гостей (число)

            После каждого ответа пользователя анализируй историю диалога и обновляй данные заказа.
            Если пользователь изменил информацию (например, сначала сказал "4 гостя", потом "нет, 5 гостей"),
            используй последнее значение.

            Если все 4 поля заполнены, спроси пользователя: "Подтвердите заказ: [адрес], [дата] в [время] на [кол-во] гостей. Верно?"
            Если пользователь подтверждает, верни финальное сообщение об успешном бронировании.

            ТЕКУЩАЯ ДАТА И ВРЕМЯ: {currentDateTime}
            Используй эту информацию для понимания относительных дат (например, "завтра", "на следующей неделе").

            Возвращай ответ в формате JSON. СТРОГО СОБЛЮДАЙ ПОРЯДОК ПОЛЕЙ:
            {
              "reservation": {
                "restaurantAddress": "...",
                "date": "...",
                "time": "...",
                "numberOfGuests": ...
              },
              "content": "твой текстовый ответ пользователю"
            }
            
            ВАЖНО: Поле "reservation" должно идти ПЕРЕД полем "content".
            Если данных недостаточно, reservation может быть null или содержать только заполненные поля.
            """;

    public AiChatService(AiChatProperties properties) {
        this.properties = properties;
        this.objectMapper = new ObjectMapper();
        
        HttpClient httpClient = HttpClient.create()
                .responseTimeout(Duration.ofSeconds(120));
        
        this.webClient = WebClient.builder()
                .baseUrl(properties.getUrl())
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(16 * 1024 * 1024))
                .build();
    }

    public Mono<ChatResponse> sendMessage(ChatRequest request) {
        logger.debug("Sending message to AI: {}", request.getMessage());

        Map<String, Object> requestBody = buildRequestBody(request);

        logger.debug("AI API Request body: {}", requestBody);

        return webClient.post()
                .uri("/chat/completions")
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + properties.getKey())
                .bodyValue(requestBody)
                .retrieve()
                .bodyToMono(Map.class)
                .map(response -> {
                    logger.debug("Received response from AI: {}", response);
                    try {
                        List<Map<String, Object>> choices = (List<Map<String, Object>>) response.get("choices");
                        if (choices != null && !choices.isEmpty()) {
                            Map<String, Object> firstChoice = choices.get(0);
                            Map<String, String> message = (Map<String, String>) firstChoice.get("message");
                            if (message != null) {
                                String content = message.get("content");
                                Reservation reservation = parseReservation(content);
                                String cleanContent = extractContentFromJson(content);
                                
                                ChatResponse chatResponse = ChatResponse.successWithReservation(cleanContent, reservation);
                                chatResponse.setDebugRequest(requestBody);
                                chatResponse.setDebugResponse(response);
                                return chatResponse;
                            }
                        }
                        ChatResponse errorResponse = ChatResponse.error("Empty response from AI");
                        errorResponse.setDebugRequest(requestBody);
                        errorResponse.setDebugResponse(response);
                        return errorResponse;
                    } catch (Exception e) {
                        logger.error("Error parsing AI response", e);
                        ChatResponse errorResponse = ChatResponse.error("Error parsing response: " + e.getMessage());
                        errorResponse.setDebugRequest(requestBody);
                        errorResponse.setDebugResponse(response);
                        return errorResponse;
                    }
                })
                .onErrorResume(e -> {
                    logger.error("Error calling AI API", e);
                    ChatResponse errorResponse = ChatResponse.error("Error calling AI: " + e.getMessage());
                    errorResponse.setDebugRequest(requestBody);
                    errorResponse.setDebugResponse(Map.of("error", e.getMessage()));
                    return Mono.just(errorResponse);
                });
    }

    public Map<String, Object> buildDebugRequest(ChatRequest request) {
        return buildRequestBody(request);
    }

    private Map<String, Object> buildRequestBody(ChatRequest request) {
        List<Map<String, String>> messages = new ArrayList<>();

        // Get current datetime in GMT+3 (Europe/Moscow timezone)
        String currentDateTime = LocalDateTime.now(ZoneId.of("Europe/Moscow"))
                .format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        
        String systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace("{currentDateTime}", currentDateTime);

        Map<String, String> systemMessage = new HashMap<>();
        systemMessage.put("role", "system");
        systemMessage.put("content", systemPrompt);
        messages.add(systemMessage);

        if (request.getHistory() != null) {
            for (ChatRequest.Message msg : request.getHistory()) {
                Map<String, String> message = new HashMap<>();
                message.put("role", msg.getRole());
                message.put("content", msg.getContent());
                messages.add(message);
            }
        }

        Map<String, String> userMessage = new HashMap<>();
        userMessage.put("role", "user");
        userMessage.put("content", request.getMessage());
        messages.add(userMessage);

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("model", properties.getModel());
        requestBody.put("messages", messages);
        requestBody.put("stream", false);
        
        // Use request settings if provided, otherwise fall back to properties
        ChatRequest.ModelSettings requestSettings = request.getSettings();
        
        if (requestSettings != null) {
            if (requestSettings.getTemperature() != null) {
                requestBody.put("temperature", requestSettings.getTemperature());
            } else if (properties.getTemperature() != null) {
                requestBody.put("temperature", properties.getTemperature());
            }
            
            if (requestSettings.getMaxTokens() != null) {
                requestBody.put("max_tokens", requestSettings.getMaxTokens());
            } else if (properties.getMaxTokens() != null) {
                requestBody.put("max_tokens", properties.getMaxTokens());
            }
            
            if (requestSettings.getTopP() != null) {
                requestBody.put("top_p", requestSettings.getTopP());
            } else if (properties.getTopP() != null) {
                requestBody.put("top_p", properties.getTopP());
            }
            
            if (requestSettings.getFrequencyPenalty() != null) {
                requestBody.put("frequency_penalty", requestSettings.getFrequencyPenalty());
            } else if (properties.getFrequencyPenalty() != null) {
                requestBody.put("frequency_penalty", properties.getFrequencyPenalty());
            }
            
            if (requestSettings.getPresencePenalty() != null) {
                requestBody.put("presence_penalty", requestSettings.getPresencePenalty());
            } else if (properties.getPresencePenalty() != null) {
                requestBody.put("presence_penalty", properties.getPresencePenalty());
            }
            
            if (requestSettings.getStop() != null && !requestSettings.getStop().isEmpty()) {
                requestBody.put("stop", requestSettings.getStop());
            } else if (properties.getStop() != null && !properties.getStop().isEmpty()) {
                requestBody.put("stop", properties.getStop());
            }
        } else {
            if (properties.getTemperature() != null) {
                requestBody.put("temperature", properties.getTemperature());
            }
            if (properties.getMaxTokens() != null) {
                requestBody.put("max_tokens", properties.getMaxTokens());
            }
            if (properties.getTopP() != null) {
                requestBody.put("top_p", properties.getTopP());
            }
            if (properties.getFrequencyPenalty() != null) {
                requestBody.put("frequency_penalty", properties.getFrequencyPenalty());
            }
            if (properties.getPresencePenalty() != null) {
                requestBody.put("presence_penalty", properties.getPresencePenalty());
            }
            if (properties.getStop() != null && !properties.getStop().isEmpty()) {
                requestBody.put("stop", properties.getStop());
            }
        }

        return requestBody;
    }

    private Reservation parseReservation(String content) {
        try {
            JsonNode rootNode = objectMapper.readTree(content);
            JsonNode reservationNode = rootNode.get("reservation");
            
            if (reservationNode == null || reservationNode.isNull()) {
                return null;
            }

            Reservation reservation = new Reservation();
            
            if (reservationNode.has("restaurantAddress")) {
                reservation.setRestaurantAddress(reservationNode.get("restaurantAddress").asText());
            }
            if (reservationNode.has("date")) {
                reservation.setDate(reservationNode.get("date").asText());
            }
            if (reservationNode.has("time")) {
                reservation.setTime(reservationNode.get("time").asText());
            }
            if (reservationNode.has("numberOfGuests")) {
                reservation.setNumberOfGuests(reservationNode.get("numberOfGuests").asInt());
            }

            return reservation;
        } catch (Exception e) {
            logger.debug("Failed to parse reservation from response: {}", e.getMessage());
            return null;
        }
    }

    private String extractContentFromJson(String content) {
        try {
            JsonNode rootNode = objectMapper.readTree(content);
            if (rootNode.has("content")) {
                return rootNode.get("content").asText();
            }
            return content;
        } catch (Exception e) {
            return content;
        }
    }
}
