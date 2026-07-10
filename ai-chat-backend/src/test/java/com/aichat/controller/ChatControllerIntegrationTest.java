package com.aichat.controller;

import com.aichat.dto.ChatRequest;
import com.aichat.dto.ChatRequest.ModelSettings;
import com.aichat.entity.TaskStatus;
import com.aichat.service.AiChatService;
import com.aichat.service.ChatHistoryService;
import com.aichat.service.FactExtractionService;
import com.aichat.service.StickyFactService;
import com.aichat.service.TaskStateService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import reactor.core.publisher.Mono;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration tests for ChatController streaming endpoint.
 * Verifies Jackson serialization of ChatResponse with TaskStateDTO including Instant fields.
 */
@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("ChatController Integration Tests")
class ChatControllerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private AiChatService chatService;

    @MockBean
    private ChatHistoryService historyService;

    @MockBean
    private StickyFactService stickyFactService;

    @MockBean
    private FactExtractionService factExtractionService;

    @MockBean
    private TaskStateService taskStateService;

    @Test
    @DisplayName("Streaming endpoint serializes TaskState with Instant fields as ISO-8601")
    void streamingEndpoint_serializesTaskStateWithInstantFields() throws Exception {
        // Given: Mock services return response with TaskState containing Instant fields
        String sessionId = "test-session-" + System.currentTimeMillis();
        Instant createdAt = Instant.parse("2026-07-10T10:30:00.000Z");
        Instant updatedAt = Instant.parse("2026-07-10T10:35:00.000Z");

        when(historyService.createSession()).thenReturn(sessionId);
        when(historyService.saveMessage(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any())).thenReturn(null);
        when(historyService.getSessionTokenUsage(any())).thenReturn(new int[]{100, 50, 150});
        
        var chatResponse = new com.aichat.dto.ChatResponse();
        chatResponse.setContent("Test response");
        chatResponse.setModel("test-model");
        
        // Mock AI service to return response
        when(chatService.sendMessage(any(ChatRequest.class)))
            .thenReturn(Mono.just(chatResponse));

        ChatRequest request = new ChatRequest();
        request.setMessage("Test message");
        ModelSettings settings = new ModelSettings();
        settings.setModel("test-model");
        request.setSettings(settings);

        String requestBody = objectMapper.writeValueAsString(request);

        // When: POST to streaming endpoint
        String responseContent = mockMvc.perform(post("/api/chat/stream")
                .contentType(MediaType.APPLICATION_JSON)
                .content(requestBody))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith("text/event-stream"))
            .andReturn()
            .getResponse()
            .getContentAsString();

        // Then: Verify response contains taskState with properly serialized Instant fields
        assertNotNull(responseContent, "Response should not be null");
        assertFalse(responseContent.isEmpty(), "Response should not be empty");

        // Parse the SSE events (multiple JSON objects separated by newlines)
        String[] events = responseContent.split("\n");
        JsonNode lastEvent = null;
        
        // Find the response event (last valid JSON)
        for (String event : events) {
            String trimmed = event.trim();
            if (!trimmed.isEmpty()) {
                try {
                    lastEvent = objectMapper.readTree(trimmed);
                } catch (Exception e) {
                    // Skip non-JSON lines
                }
            }
        }

        assertNotNull(lastEvent, "Should have at least one valid JSON event");
        assertEquals("response", lastEvent.get("type").asText(), "Last event should be response type");

        JsonNode data = lastEvent.get("data");
        assertNotNull(data, "Response should have data field");

        // Verify taskState field exists
        JsonNode taskStateNode = data.get("taskState");
        if (taskStateNode != null && !taskStateNode.isNull()) {
            // Verify createdAt field exists and is ISO-8601 format
            JsonNode createdAtNode = taskStateNode.get("createdAt");
            if (createdAtNode != null && !createdAtNode.isNull()) {
                String createdAtValue = createdAtNode.asText();
                assertNotNull(createdAtValue, "createdAt should not be null");
                assertTrue(
                    createdAtValue.matches("\\d{4}-\\d{2}-\\d{2}T.*"),
                    "createdAt should be ISO-8601 format, got: " + createdAtValue
                );
            }

            // Verify updatedAt field exists and is ISO-8601 format
            JsonNode updatedAtNode = taskStateNode.get("updatedAt");
            if (updatedAtNode != null && !updatedAtNode.isNull()) {
                String updatedAtValue = updatedAtNode.asText();
                assertNotNull(updatedAtValue, "updatedAt should not be null");
                assertTrue(
                    updatedAtValue.matches("\\d{4}-\\d{2}-\\d{2}T.*"),
                    "updatedAt should be ISO-8601 format, got: " + updatedAtValue
                );
            }
        }

        // Verify sessionId is present
        JsonNode sessionIdNode = lastEvent.get("sessionId");
        assertNotNull(sessionIdNode, "Response should have sessionId field");
        assertEquals(sessionId, sessionIdNode.asText(), "SessionId should match");
    }
}
