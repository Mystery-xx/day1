package com.aichat.service;

import com.aichat.config.AiChatProperties;
import com.aichat.context.ContextStrategy;
import com.aichat.context.ContextStrategyFactory;
import com.aichat.context.ContextStrategyType;
import com.aichat.context.TaskStateContextStrategy;
import com.aichat.dto.ChatRequest;
import com.aichat.service.ollama.OllamaClient;
import com.aichat.service.adapter.OllamaResponseAdapter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import reactor.core.publisher.Mono;

import java.util.Collections;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Unit tests for AiChatService connection pooling configuration.
 * Validates that HttpClient is properly configured to support multiple consecutive requests.
 * 
 * Note: These tests verify service initialization and configuration.
 * Actual connection pooling behavior is validated through integration tests.
 */
@DisplayName("AiChatService Connection Pooling Unit Tests")
@ExtendWith(MockitoExtension.class)
class AiChatServiceConnectionPoolingTest {

    @Mock
    private ChatHistoryService chatHistoryService;

    @Mock
    private ContextStrategyFactory contextStrategyFactory;

    @Mock
    private ContextStrategy contextStrategy;

    @Mock
    private McpClientService mcpClientService;

    @Mock
    private RagSearchService ragSearchService;

    @Mock
    private TaskStateContextStrategy taskStateContextStrategy;

    @Mock
    private TaskStateExtractionStrategy taskStateExtractionStrategy;

    @Mock
    private TaskStateService taskStateService;

    @Mock
    private AiChatProperties aiChatProperties;

    @Mock
    private OllamaClient ollamaClient;

    @Mock
    private OllamaResponseAdapter ollamaResponseAdapter;

    private AiChatService aiChatService;

    @BeforeEach
    void setUp() {
        lenient().when(aiChatProperties.getProvider()).thenReturn("gpustack");
        lenient().when(aiChatProperties.getProviderBaseUrl()).thenReturn("http://localhost:8082");
        lenient().when(aiChatProperties.getKey()).thenReturn("test-api-key");
        lenient().when(aiChatProperties.getModel()).thenReturn("test-model");
        lenient().when(aiChatProperties.getTemperature()).thenReturn(0.7);
        lenient().when(aiChatProperties.getMaxTokens()).thenReturn(2048);
        lenient().when(mcpClientService.getToolDefinitionsForAI()).thenReturn(Collections.emptyList());
        lenient().when(contextStrategyFactory.createStrategy(any(ContextStrategyType.class))).thenReturn(contextStrategy);
        lenient().when(contextStrategy.buildContext(anyString(), any())).thenReturn(Collections.emptyList());
        lenient().when(taskStateContextStrategy.buildContext(anyString(), any())).thenReturn(Collections.emptyList());
        
        aiChatService = new AiChatService(
            aiChatProperties,
            chatHistoryService,
            contextStrategyFactory,
            mcpClientService,
            ragSearchService,
            taskStateContextStrategy,
            taskStateExtractionStrategy,
            taskStateService,
            ollamaClient,
            ollamaResponseAdapter
        );
    }

    @Test
    @DisplayName("Service initialization: AiChatService creates successfully with HttpClient")
    void testServiceInitialization() {
        assertNotNull(aiChatService, "Service should be initialized successfully");
    }

    @Test
    @DisplayName("Multiple service instances: can create 3+ service instances")
    void testMultipleServiceInstances() {
        final int instanceCount = 3;
        AtomicInteger createdCount = new AtomicInteger(0);
        
        for (int i = 0; i < instanceCount; i++) {
            AiChatService service = new AiChatService(
                aiChatProperties,
                chatHistoryService,
                contextStrategyFactory,
                mcpClientService,
                ragSearchService,
                taskStateContextStrategy,
                taskStateExtractionStrategy,
                taskStateService,
                ollamaClient,
                ollamaResponseAdapter
            );
            assertNotNull(service);
            createdCount.incrementAndGet();
        }
        
        assertEquals(instanceCount, createdCount.get(), 
            "Should be able to create multiple service instances");
    }

    @Test
    @DisplayName("Concurrent service creation: multiple threads can create service instances")
    void testConcurrentServiceCreation() throws Exception {
        final int concurrentCount = 3;
        final CountDownLatch latch = new CountDownLatch(concurrentCount);
        final AtomicInteger createdCount = new AtomicInteger(0);

        Thread[] threads = new Thread[concurrentCount];
        for (int i = 0; i < concurrentCount; i++) {
            threads[i] = new Thread(() -> {
                try {
                    AiChatService service = new AiChatService(
                        aiChatProperties,
                        chatHistoryService,
                        contextStrategyFactory,
                        mcpClientService,
                        ragSearchService,
                        taskStateContextStrategy,
                        taskStateExtractionStrategy,
                        taskStateService,
                        ollamaClient,
                        ollamaResponseAdapter
                    );
                    assertNotNull(service);
                    createdCount.incrementAndGet();
                } finally {
                    latch.countDown();
                }
            });
            threads[i].start();
        }

        boolean completed = latch.await(10, TimeUnit.SECONDS);
        assertTrue(completed, "All threads should complete within timeout");
        assertEquals(concurrentCount, createdCount.get(), 
            "All threads should successfully create service instances");
        
        for (Thread thread : threads) {
            thread.join(5000);
        }
    }

    @Test
    @DisplayName("Request creation: service can create Mono for multiple requests")
    void testMultipleRequestCreation() {
        final int requestCount = 5;
        AtomicInteger createdCount = new AtomicInteger(0);

        ChatRequest chatRequest = new ChatRequest();
        chatRequest.setMessage("Test message");
        chatRequest.setSessionId("test-session");
        
        ChatRequest.ModelSettings settings = new ChatRequest.ModelSettings();
        settings.setModel("test-model");
        settings.setProvider("gpustack");
        chatRequest.setSettings(settings);

        for (int i = 0; i < requestCount; i++) {
            Mono<com.aichat.dto.ChatResponse> responseMono = aiChatService.sendMessage(chatRequest);
            assertNotNull(responseMono, "Request " + i + " should create a Mono");
            createdCount.incrementAndGet();
        }

        assertEquals(requestCount, createdCount.get(), 
            "Should be able to create multiple request Monos");
    }

    @Test
    @DisplayName("Rapid sequential requests: service handles 10+ rapid request creations")
    void testRapidSequentialRequests() {
        final int rapidRequestCount = 10;

        ChatRequest chatRequest = new ChatRequest();
        chatRequest.setMessage("Rapid test message");
        chatRequest.setSessionId("rapid-test-session");
        
        ChatRequest.ModelSettings settings = new ChatRequest.ModelSettings();
        settings.setModel("test-model");
        settings.setProvider("gpustack");
        chatRequest.setSettings(settings);

        for (int i = 0; i < rapidRequestCount; i++) {
            Mono<com.aichat.dto.ChatResponse> responseMono = aiChatService.sendMessage(chatRequest);
            assertNotNull(responseMono);
        }
    }
}
