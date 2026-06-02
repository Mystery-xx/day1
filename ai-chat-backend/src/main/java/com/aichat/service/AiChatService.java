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
import reactor.core.publisher.Mono;

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

    private static final String SYSTEM_PROMPT = """
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

            Возвращай ответ в формате JSON:
            {
              "content": "твой текстовый ответ пользователю",
              "reservation": {
                "restaurantAddress": "...",
                "date": "...",
                "time": "...",
                "numberOfGuests": ...
              }
            }
            Если данных недостаточно, reservation может быть null или содержать только заполненные поля.
            """;

    public AiChatService(WebClient webClient, AiChatProperties properties) {
        this.webClient = webClient;
        this.properties = properties;
        this.objectMapper = new ObjectMapper();
    }

    public Mono<ChatResponse> sendMessage(ChatRequest request) {
        logger.debug("Sending message to AI: {}", request.getMessage());

        List<Map<String, String>> messages = new ArrayList<>();

        Map<String, String> systemMessage = new HashMap<>();
        systemMessage.put("role", "system");
        systemMessage.put("content", SYSTEM_PROMPT);
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
                                return ChatResponse.successWithReservation(cleanContent, reservation);
                            }
                        }
                        return ChatResponse.error("Empty response from AI");
                    } catch (Exception e) {
                        logger.error("Error parsing AI response", e);
                        return ChatResponse.error("Error parsing response: " + e.getMessage());
                    }
                })
                .onErrorResume(e -> {
                    logger.error("Error calling AI API", e);
                    return Mono.just(ChatResponse.error("Error calling AI: " + e.getMessage()));
                });
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
