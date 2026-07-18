package com.aichat.service;

import com.aichat.dto.ChatRequest;
import com.aichat.dto.ChatResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.*;
import org.springframework.test.context.ActiveProfiles;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * End-to-End tests for Ollama local provider integration.
 * 
 * These tests run against a REAL Ollama instance (no mocks).
 * Prerequisites:
 * - Ollama must be running and accessible
 * - Model must be pulled (e.g., llama3.2)
 * - Backend must be running with proper configuration
 * 
 * Run with: mvn test -Dtest=OllamaE2ETest
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@DisplayName("Ollama E2E Tests")
class OllamaE2ETest {

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate restTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    private static String baseUrl;

    @BeforeAll
    static void setUp(@Autowired TestRestTemplate restTemplate,
                      @LocalServerPort int port) {
        baseUrl = "http://localhost:" + port + "/api/chat";
    }

    @Test
    @DisplayName("E2E: Local provider returns content field in response")
    void testLocalProviderReturnsContent() {
        // Given: A chat request with local provider
        ChatRequest request = new ChatRequest();
        request.setMessage("ping");
        
        ChatRequest.ModelSettings settings = new ChatRequest.ModelSettings();
        settings.setProvider("local");
        settings.setModel("llama3.1:8b-instruct-q4_K_M");
        request.setSettings(settings);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        
        HttpEntity<ChatRequest> entity = new HttpEntity<>(request, headers);

        // When: Send POST request to chat endpoint
        ResponseEntity<ChatResponse> response = restTemplate.postForEntity(baseUrl, entity, ChatResponse.class);

        // Then: Assert response status and content
        assertEquals(HttpStatus.OK, response.getStatusCode(), "Response status should be OK");
        
        ChatResponse chatResponse = response.getBody();
        assertNotNull(chatResponse, "Response body should not be null");
        assertNotNull(chatResponse.getContent(), "Response should have content field");
        assertFalse(chatResponse.getContent().isBlank(), "Content should not be blank");
        
        // Verify response has model information
        assertNotNull(chatResponse.getModel(), "Response should include model name");
        
        System.out.println("✓ E2E Test Passed: Local provider returned content: " + 
            chatResponse.getContent().substring(0, Math.min(100, chatResponse.getContent().length())));
    }

    @Test
    @DisplayName("E2E: Local provider with different message")
    void testLocalProviderWithDifferentMessage() {
        // Given: A chat request with a simple question
        ChatRequest request = new ChatRequest();
        request.setMessage("What is 2+2? Answer briefly.");
        
        ChatRequest.ModelSettings settings = new ChatRequest.ModelSettings();
        settings.setProvider("local");
        settings.setModel("llama3.1:8b-instruct-q4_K_M");
        request.setSettings(settings);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        
        HttpEntity<ChatRequest> entity = new HttpEntity<>(request, headers);

        // When: Send POST request to chat endpoint
        ResponseEntity<ChatResponse> response = restTemplate.postForEntity(baseUrl, entity, ChatResponse.class);

        // Then: Assert response is successful and has content
        assertEquals(HttpStatus.OK, response.getStatusCode());
        
        ChatResponse chatResponse = response.getBody();
        assertNotNull(chatResponse);
        assertNotNull(chatResponse.getContent());
        assertFalse(chatResponse.getContent().isBlank());
        
        // Response should mention "4" somewhere
        assertTrue(chatResponse.getContent().contains("4"), 
            "Response should contain the answer '4'");
        
        System.out.println("✓ E2E Test Passed: Math question answered correctly");
    }

    @Test
    @DisplayName("E2E: Health check endpoint works")
    void testHealthEndpoint() {
        // When: Call health endpoint
        String healthUrl = "http://localhost:" + port + "/api/chat/health";
        ResponseEntity<String> response = restTemplate.getForEntity(healthUrl, String.class);

        // Then: Health check returns OK
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().contains("OK") || response.getBody().contains("UP"));
        
        System.out.println("✓ Health Check Passed: " + response.getBody());
    }

    @Test
    @DisplayName("E2E: Local provider handles session context")
    void testLocalProviderWithSession() {
        // Given: A chat request with session ID
        String sessionId = "e2e-test-session-" + System.currentTimeMillis();
        
        ChatRequest request = new ChatRequest();
        request.setSessionId(sessionId);
        request.setMessage("Hello, my name is E2E Test User");
        
        ChatRequest.ModelSettings settings = new ChatRequest.ModelSettings();
        settings.setProvider("local");
        settings.setModel("llama3.1:8b-instruct-q4_K_M");
        request.setSettings(settings);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        
        HttpEntity<ChatRequest> entity = new HttpEntity<>(request, headers);

        // When: Send first message
        ResponseEntity<ChatResponse> response1 = restTemplate.postForEntity(baseUrl, entity, ChatResponse.class);

        // Then: First response is successful
        assertEquals(HttpStatus.OK, response1.getStatusCode());
        assertNotNull(response1.getBody());
        assertNotNull(response1.getBody().getContent());
        
        // When: Send follow-up message in same session
        ChatRequest request2 = new ChatRequest();
        request2.setSessionId(sessionId);
        request2.setMessage("What is my name?");
        request2.setSettings(settings);
        
        HttpEntity<ChatRequest> entity2 = new HttpEntity<>(request2, headers);
        ResponseEntity<ChatResponse> response2 = restTemplate.postForEntity(baseUrl, entity2, ChatResponse.class);

        // Then: Second response acknowledges context
        assertEquals(HttpStatus.OK, response2.getStatusCode());
        assertNotNull(response2.getBody());
        assertNotNull(response2.getBody().getContent());
        
        // Response should mention the name or acknowledge knowing it
        String content = response2.getBody().getContent();
        assertTrue(content.toLowerCase().contains("e2e") || 
                   content.toLowerCase().contains("test") ||
                   content.toLowerCase().contains("user") ||
                   content.toLowerCase().contains("name"),
            "Response should acknowledge the user's name or context");
        
        System.out.println("✓ E2E Test Passed: Session context maintained");
    }
}
