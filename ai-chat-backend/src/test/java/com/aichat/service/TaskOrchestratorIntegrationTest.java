package com.aichat.service;

import com.aichat.BaseIntegrationTest;
import com.aichat.dto.ChatMessageDTO;
import com.aichat.dto.TaskContext;
import com.aichat.entity.ChatSession;
import com.aichat.entity.TaskContextEntity;
import com.aichat.enums.TaskState;
import com.aichat.repository.ChatSessionRepository;
import com.aichat.repository.TaskContextRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@BaseIntegrationTest
@DisplayName("TaskOrchestrator Integration Tests - Full Cycle")
class TaskOrchestratorIntegrationTest {

    @Autowired
    private TaskOrchestrator orchestrator;

    @Autowired
    private ChatSessionRepository sessionRepository;

    @Autowired
    private TaskContextRepository contextRepository;

    @MockBean
    private WebClient webClient;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUpMocks() {
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private void setupMockResponse(Map<String, Object> response) {
        WebClient.RequestBodyUriSpec uriSpec = mock(WebClient.RequestBodyUriSpec.class);
        WebClient.RequestBodySpec bodySpec = mock(WebClient.RequestBodySpec.class);
        WebClient.RequestHeadersSpec headersSpec = mock(WebClient.RequestHeadersSpec.class);
        WebClient.ResponseSpec responseSpec = mock(WebClient.ResponseSpec.class);
        Mono mono = Mono.just(response);

        when(webClient.post()).thenReturn(uriSpec);
        when(uriSpec.uri(anyString())).thenReturn(bodySpec);
        when(bodySpec.header(anyString(), any())).thenReturn(bodySpec);
        when(bodySpec.bodyValue(any())).thenReturn(headersSpec);
        when(headersSpec.retrieve()).thenReturn(responseSpec);
        when(responseSpec.bodyToMono(Map.class)).thenReturn(mono);
    }

    @Test
    @DisplayName("Full Cycle Test: PLANNING → EXECUTION → VALIDATION → DONE")
    @SuppressWarnings("unchecked")
    void testFullCycle_PlanningToDone() {
        String sessionId = "test-session-full-cycle";
        ChatSession session = new ChatSession();
        session.setSessionId(sessionId);
        session.setTaskState(TaskState.PLANNING);
        sessionRepository.save(session);

        try {
            Map<String, Object> planningResponse = Map.of(
                "choices", List.of(Map.of("message", Map.of("content", "Plan: 1. Design database schema. 2. Implement login API.")))
            );
            Map<String, Object> executionResponse = Map.of(
                "choices", List.of(Map.of("message", Map.of("content", "Implementation: public class AuthService { ... }")))
            );
            Map<String, Object> validationResponse = Map.of(
                "choices", List.of(Map.of("message", Map.of("content", "Validation passed")))
            );

            WebClient.RequestBodyUriSpec uriSpec = mock(WebClient.RequestBodyUriSpec.class);
            WebClient.RequestBodySpec bodySpec = mock(WebClient.RequestBodySpec.class);
            WebClient.RequestHeadersSpec headersSpec = mock(WebClient.RequestHeadersSpec.class);
            WebClient.ResponseSpec responseSpec = mock(WebClient.ResponseSpec.class);

            when(webClient.post()).thenReturn(uriSpec);
            when(uriSpec.uri(anyString())).thenReturn(bodySpec);
            when(bodySpec.header(anyString(), any())).thenReturn(bodySpec);
            when(bodySpec.bodyValue(any())).thenReturn(headersSpec);
            when(headersSpec.retrieve()).thenReturn(responseSpec);
            when(responseSpec.bodyToMono(Map.class)).thenReturn(
                Mono.just(planningResponse),
                Mono.just(executionResponse),
                Mono.just(validationResponse)
            );

            TaskContext initialContext = orchestrator.getContext(sessionId);
            assertNull(initialContext, "Context should not exist yet for new session");

            ChatSession loadedSession = sessionRepository.findBySessionId(sessionId).orElseThrow();
            assertEquals(TaskState.PLANNING, loadedSession.getTaskState(), "Initial state should be PLANNING");

            ChatMessageDTO planningMessage = new ChatMessageDTO("user", "Create a plan for user authentication. утверждаю план, приступай");
            TaskContext planningResult = orchestrator.processMessage(sessionId, planningMessage);

            assertNotNull(planningResult, "Planning result should not be null");
            assertNotNull(planningResult.getApprovedPlan(), "Plan should be generated");

            TaskContextEntity savedContext = contextRepository.findBySessionId(loadedSession.getId()).orElseThrow();
            assertNotNull(savedContext.getApprovedPlan(), "Saved context should have plan");

            ChatSession afterPlanningSession = sessionRepository.findBySessionId(sessionId).orElseThrow();
            assertEquals(TaskState.EXECUTION, afterPlanningSession.getTaskState(), "State should transition to EXECUTION");
            assertTrue(TaskState.PLANNING.isValidTransition(TaskState.EXECUTION), "PLANNING → EXECUTION should be valid");

            ChatMessageDTO executionMessage = new ChatMessageDTO("user", "Implement the authentication feature. готово, реализовал ```code```");
            TaskContext executionResult = orchestrator.processMessage(sessionId, executionMessage);

            assertNotNull(executionResult, "Execution result should not be null");
            assertNotNull(executionResult.getImplementation(), "Implementation should be generated");

            TaskContextEntity updatedContext = contextRepository.findBySessionId(loadedSession.getId()).orElseThrow();
            assertNotNull(updatedContext.getImplementation(), "Saved context should have implementation");

            ChatSession afterExecutionSession = sessionRepository.findBySessionId(sessionId).orElseThrow();
            assertEquals(TaskState.VALIDATION, afterExecutionSession.getTaskState(), "State should transition to VALIDATION");
            assertTrue(TaskState.EXECUTION.isValidTransition(TaskState.VALIDATION), "EXECUTION → VALIDATION should be valid");

            ChatMessageDTO validationMessage = new ChatMessageDTO("user", "Validate the implementation. всё готово, доволен");
            TaskContext validationResult = orchestrator.processMessage(sessionId, validationMessage);

            assertNotNull(validationResult, "Validation result should not be null");

            TaskContext validationContext = orchestrator.getContext(sessionId);
            assertNotNull(validationContext, "Validation context should be retrievable");
            assertNotNull(validationContext.getMetadata(), "Context should have metadata");
            assertTrue(validationContext.getMetadata().containsKey("validationStatus"), "Metadata should contain validationStatus");

            ChatSession afterValidationSession = sessionRepository.findBySessionId(sessionId).orElseThrow();
            assertEquals(TaskState.DONE, afterValidationSession.getTaskState(), "State should transition to DONE");
            assertTrue(TaskState.VALIDATION.isValidTransition(TaskState.DONE), "VALIDATION → DONE should be valid");

            TaskContext finalPersistedContext = orchestrator.getContext(sessionId);
            assertNotNull(finalPersistedContext, "Final context should be retrievable");
            assertNotNull(finalPersistedContext.getApprovedPlan(), "Plan should persist");
            assertNotNull(finalPersistedContext.getImplementation(), "Implementation should persist");
            
            ChatSession finalSession = sessionRepository.findBySessionId(sessionId).orElseThrow();
            assertEquals(TaskState.DONE, finalSession.getTaskState(), "Final state should be DONE");

            System.out.println("✓ Full cycle completed: PLANNING → EXECUTION → VALIDATION → DONE");

        } finally {
            contextRepository.deleteAll();
            sessionRepository.deleteAll();
        }
    }

    @Test
    @DisplayName("Context Persistence: Multiple requests in same state")
    @SuppressWarnings("unchecked")
    void testContextPersistence_AcrossRequests() {
        String sessionId = "test-session-persistence";
        ChatSession session = new ChatSession();
        session.setSessionId(sessionId);
        session.setTaskState(TaskState.PLANNING);
        sessionRepository.save(session);

        try {
            Map<String, Object> firstResponse = Map.of(
                "choices", List.of(Map.of("message", Map.of("content", "Initial plan")))
            );
            Map<String, Object> secondResponse = Map.of(
                "choices", List.of(Map.of("message", Map.of("content", "Refined plan")))
            );

            WebClient.RequestBodyUriSpec uriSpec2 = mock(WebClient.RequestBodyUriSpec.class);
            WebClient.RequestBodySpec bodySpec2 = mock(WebClient.RequestBodySpec.class);
            WebClient.RequestHeadersSpec headersSpec2 = mock(WebClient.RequestHeadersSpec.class);
            WebClient.ResponseSpec responseSpec2 = mock(WebClient.ResponseSpec.class);

            when(webClient.post()).thenReturn(uriSpec2);
            when(uriSpec2.uri(anyString())).thenReturn(bodySpec2);
            when(bodySpec2.header(anyString(), any())).thenReturn(bodySpec2);
            when(bodySpec2.bodyValue(any())).thenReturn(headersSpec2);
            when(headersSpec2.retrieve()).thenReturn(responseSpec2);
            when(responseSpec2.bodyToMono(Map.class)).thenReturn(
                Mono.just(firstResponse),
                Mono.just(secondResponse)
            );

            ChatMessageDTO firstMessage = new ChatMessageDTO("user", "Create a plan for feature X");
            TaskContext firstResult = orchestrator.processMessage(sessionId, firstMessage);

            ChatMessageDTO secondMessage = new ChatMessageDTO("user", "Refine the plan");
            TaskContext secondResult = orchestrator.processMessage(sessionId, secondMessage);

            assertNotNull(secondResult, "Second result should not be null");
            assertNotNull(secondResult.getApprovedPlan(), "Plan should be present in second request");

            var contextEntities = contextRepository.findAll();
            assertEquals(1, contextEntities.size(), "Should have only one context entity");

            System.out.println("✓ Context persistence verified across requests");

        } finally {
            contextRepository.deleteAll();
            sessionRepository.deleteAll();
        }
    }

    @Test
    @DisplayName("State Transition Validation: Invalid transitions rejected")
    void testStateTransitionValidation() {
        String sessionId = "test-session-transition-validation";
        ChatSession session = new ChatSession();
        session.setSessionId(sessionId);
        session.setTaskState(TaskState.PLANNING);
        sessionRepository.save(session);

        try {
            assertThrows(IllegalStateException.class, () -> {
                orchestrator.transitionTo(sessionId, TaskState.DONE, "Invalid skip");
            }, "PLANNING → DONE should be invalid");

            ChatSession unchangedSession = sessionRepository.findBySessionId(sessionId).orElseThrow();
            assertEquals(TaskState.PLANNING, unchangedSession.getTaskState(), "State should remain PLANNING");

            System.out.println("✓ Invalid state transitions correctly rejected");

        } finally {
            sessionRepository.deleteAll();
        }
    }

    @Test
    @DisplayName("Agent Selection: Correct agent for each state")
    void testGetCurrentAgent_ForEachState() {
        String sessionId = "test-session-agent-selection";

        ChatSession planningSession = new ChatSession();
        planningSession.setSessionId(sessionId + "-planning");
        planningSession.setTaskState(TaskState.PLANNING);
        sessionRepository.save(planningSession);

        ChatSession executionSession = new ChatSession();
        executionSession.setSessionId(sessionId + "-execution");
        executionSession.setTaskState(TaskState.EXECUTION);
        sessionRepository.save(executionSession);

        ChatSession validationSession = new ChatSession();
        validationSession.setSessionId(sessionId + "-validation");
        validationSession.setTaskState(TaskState.VALIDATION);
        sessionRepository.save(validationSession);

        try {
            var planningAgent = orchestrator.getCurrentAgent(sessionId + "-planning");
            assertNotNull(planningAgent, "Planning agent should be returned");
            assertEquals(TaskState.PLANNING, planningAgent.getState(), "Agent state should be PLANNING");

            var executionAgent = orchestrator.getCurrentAgent(sessionId + "-execution");
            assertNotNull(executionAgent, "Execution agent should be returned");
            assertEquals(TaskState.EXECUTION, executionAgent.getState(), "Agent state should be EXECUTION");

            var validationAgent = orchestrator.getCurrentAgent(sessionId + "-validation");
            assertNotNull(validationAgent, "Validation agent should be returned");
            assertEquals(TaskState.VALIDATION, validationAgent.getState(), "Agent state should be VALIDATION");

            System.out.println("✓ Correct agents returned for each state");

        } finally {
            sessionRepository.deleteAll();
        }
    }
}
