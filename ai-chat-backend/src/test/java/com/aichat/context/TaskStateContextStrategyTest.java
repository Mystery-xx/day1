package com.aichat.context;

import com.aichat.dto.ChatMessageDTO;
import com.aichat.dto.ChatRequest;
import com.aichat.dto.ClarificationDTO;
import com.aichat.dto.ConstraintDTO;
import com.aichat.dto.TaskStateDTO;
import com.aichat.entity.TaskStatus;
import com.aichat.service.TaskStateService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * Comprehensive unit tests for TaskStateContextStrategy.
 * Tests context building with goal, constraints, and clarifications.
 */
@DisplayName("TaskStateContextStrategy Unit Tests")
class TaskStateContextStrategyTest {

    @Mock
    private TaskStateService taskStateService;

    private TaskStateContextStrategy contextStrategy;
    private final String testSessionId = "test-session-456";
    private final Instant testTime = Instant.parse("2024-01-01T12:00:00Z");

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        contextStrategy = new TaskStateContextStrategy(taskStateService);
    }

    @Test
    @DisplayName("buildContext: includes goal in context message")
    void testBuildContext_includesGoal() {
        // Arrange
        TaskStateDTO taskState = new TaskStateDTO();
        taskState.setSessionId(testSessionId);
        taskState.setGoal("Implement user authentication with JWT tokens");
        taskState.setStatus(TaskStatus.CLARIFYING);
        taskState.setConstraints(new ArrayList<>());
        taskState.setClarifications(new ArrayList<>());
        taskState.setCreatedAt(testTime);
        taskState.setUpdatedAt(testTime);
        
        when(taskStateService.getTaskState(testSessionId)).thenReturn(taskState);

        ChatRequest.ModelSettings settings = new ChatRequest.ModelSettings();

        // Act
        List<ChatMessageDTO> result = contextStrategy.buildContext(testSessionId, settings);

        // Assert
        assertNotNull(result);
        assertEquals(1, result.size(), "Should return exactly one system message");
        
        ChatMessageDTO systemMessage = result.get(0);
        assertEquals("system", systemMessage.getRole());
        assertEquals(testSessionId, systemMessage.getSessionId());
        
        String content = systemMessage.getContent();
        assertNotNull(content);
        assertTrue(content.contains("Task Goal:"));
        assertTrue(content.contains("Implement user authentication with JWT tokens"));
        assertTrue(content.contains("Task Status:"));
        assertTrue(content.contains(TaskStatus.CLARIFYING.toString()));
    }

    @Test
    @DisplayName("buildContext: includes constraints in context message")
    void testBuildContext_includesConstraints() {
        // Arrange
        List<ConstraintDTO> constraints = new ArrayList<>();
        constraints.add(new ConstraintDTO("TECHNICAL", "Must use Spring Boot 3.2", false));
        constraints.add(new ConstraintDTO("TIME", "Complete within 2 weeks", false));
        
        TaskStateDTO taskState = new TaskStateDTO();
        taskState.setSessionId(testSessionId);
        taskState.setGoal("Build REST API");
        taskState.setStatus(TaskStatus.EXECUTING);
        taskState.setConstraints(constraints);
        taskState.setClarifications(new ArrayList<>());
        taskState.setCreatedAt(testTime);
        taskState.setUpdatedAt(testTime);
        
        when(taskStateService.getTaskState(testSessionId)).thenReturn(taskState);

        ChatRequest.ModelSettings settings = new ChatRequest.ModelSettings();

        // Act
        List<ChatMessageDTO> result = contextStrategy.buildContext(testSessionId, settings);

        // Assert
        assertNotNull(result);
        assertEquals(1, result.size());
        
        ChatMessageDTO systemMessage = result.get(0);
        String content = systemMessage.getContent();
        assertNotNull(content);
        assertTrue(content.contains("Constraints:"));
        assertTrue(content.contains("TECHNICAL"));
        assertTrue(content.contains("Must use Spring Boot 3.2"));
        assertTrue(content.contains("TIME"));
        assertTrue(content.contains("Complete within 2 weeks"));
    }

    @Test
    @DisplayName("buildContext: includes clarifications in context message")
    void testBuildContext_includesClarifications() {
        // Arrange
        List<ClarificationDTO> clarifications = new ArrayList<>();
        clarifications.add(new ClarificationDTO(
            "What is the target audience?",
            "Enterprise customers",
            testTime
        ));
        clarifications.add(new ClarificationDTO(
            "What platforms to support?",
            "Web and mobile",
            testTime.plusSeconds(300)
        ));
        
        TaskStateDTO taskState = new TaskStateDTO();
        taskState.setSessionId(testSessionId);
        taskState.setGoal("Build e-commerce platform");
        taskState.setStatus(TaskStatus.CLARIFYING);
        taskState.setConstraints(new ArrayList<>());
        taskState.setClarifications(clarifications);
        taskState.setCreatedAt(testTime);
        taskState.setUpdatedAt(testTime);
        
        when(taskStateService.getTaskState(testSessionId)).thenReturn(taskState);

        ChatRequest.ModelSettings settings = new ChatRequest.ModelSettings();

        // Act
        List<ChatMessageDTO> result = contextStrategy.buildContext(testSessionId, settings);

        // Assert
        assertNotNull(result);
        assertEquals(1, result.size());
        
        ChatMessageDTO systemMessage = result.get(0);
        String content = systemMessage.getContent();
        assertNotNull(content);
        assertTrue(content.contains("Recent Clarifications:"));
        assertTrue(content.contains("What is the target audience?"));
        assertTrue(content.contains("Enterprise customers"));
        assertTrue(content.contains("What platforms to support?"));
        assertTrue(content.contains("Web and mobile"));
    }

    @Test
    @DisplayName("buildContext: returns empty list when TaskState not found")
    void testBuildContext_taskStateNotFound() {
        // Arrange
        when(taskStateService.getTaskState(testSessionId))
            .thenThrow(new RuntimeException("TaskState not found"));

        ChatRequest.ModelSettings settings = new ChatRequest.ModelSettings();

        // Act
        List<ChatMessageDTO> result = contextStrategy.buildContext(testSessionId, settings);

        // Assert
        assertNotNull(result);
        assertTrue(result.isEmpty(), "Should return empty list when TaskState not found");
    }

    @Test
    @DisplayName("buildContext: returns empty list when TaskState is null")
    void testBuildContext_taskStateIsNull() {
        // Arrange
        when(taskStateService.getTaskState(testSessionId)).thenReturn(null);

        ChatRequest.ModelSettings settings = new ChatRequest.ModelSettings();

        // Act
        List<ChatMessageDTO> result = contextStrategy.buildContext(testSessionId, settings);

        // Assert
        assertNotNull(result);
        assertTrue(result.isEmpty(), "Should return empty list when TaskState is null");
    }

    @Test
    @DisplayName("buildContext: returns empty list when goal is null")
    void testBuildContext_goalIsNull() {
        // Arrange
        TaskStateDTO taskState = new TaskStateDTO();
        taskState.setSessionId(testSessionId);
        taskState.setGoal(null);
        taskState.setStatus(TaskStatus.CLARIFYING);
        
        when(taskStateService.getTaskState(testSessionId)).thenReturn(taskState);

        ChatRequest.ModelSettings settings = new ChatRequest.ModelSettings();

        // Act
        List<ChatMessageDTO> result = contextStrategy.buildContext(testSessionId, settings);

        // Assert
        assertNotNull(result);
        assertTrue(result.isEmpty(), "Should return empty list when goal is null");
    }

    @Test
    @DisplayName("buildContext: handles empty constraints and clarifications")
    void testBuildContext_emptyConstraintsAndClarifications() {
        // Arrange
        TaskStateDTO taskState = new TaskStateDTO();
        taskState.setSessionId(testSessionId);
        taskState.setGoal("Simple task");
        taskState.setStatus(TaskStatus.CLARIFYING);
        taskState.setConstraints(new ArrayList<>());
        taskState.setClarifications(new ArrayList<>());
        taskState.setCreatedAt(testTime);
        taskState.setUpdatedAt(testTime);
        
        when(taskStateService.getTaskState(testSessionId)).thenReturn(taskState);

        ChatRequest.ModelSettings settings = new ChatRequest.ModelSettings();

        // Act
        List<ChatMessageDTO> result = contextStrategy.buildContext(testSessionId, settings);

        // Assert
        assertNotNull(result);
        assertEquals(1, result.size());
        
        ChatMessageDTO systemMessage = result.get(0);
        String content = systemMessage.getContent();
        assertNotNull(content);
        assertTrue(content.contains("Task Goal:"));
        assertTrue(content.contains("Simple task"));
        // Should not contain Constraints or Clarifications sections when empty
        assertFalse(content.contains("Constraints:"), "Should not show Constraints section when empty");
        assertFalse(content.contains("Recent Clarifications:"), "Should not show Clarifications section when empty");
    }

    @Test
    @DisplayName("buildContext: includes all components together")
    void testBuildContext_completeContext() {
        // Arrange
        List<ConstraintDTO> constraints = new ArrayList<>();
        constraints.add(new ConstraintDTO("SCOPE", "Only backend API", false));
        
List<ClarificationDTO> clarifications = new ArrayList<>();
        clarifications.add(new ClarificationDTO(
            "Database preference?",
            "PostgreSQL",
            testTime.plusSeconds(300)
        ));
        
        TaskStateDTO taskState = new TaskStateDTO();
        taskState.setSessionId(testSessionId);
        taskState.setGoal("Create microservice for user management");
        taskState.setStatus(TaskStatus.EXECUTING);
        taskState.setConstraints(constraints);
        taskState.setClarifications(clarifications);
        taskState.setCreatedAt(testTime);
        taskState.setUpdatedAt(testTime);
        
        when(taskStateService.getTaskState(testSessionId)).thenReturn(taskState);

        ChatRequest.ModelSettings settings = new ChatRequest.ModelSettings();

        // Act
        List<ChatMessageDTO> result = contextStrategy.buildContext(testSessionId, settings);

        // Assert
        assertNotNull(result);
        assertEquals(1, result.size());
        
        ChatMessageDTO systemMessage = result.get(0);
        String content = systemMessage.getContent();
        assertNotNull(content);
        
        // Verify all components are present
        assertTrue(content.contains("Task Goal:"));
        assertTrue(content.contains("Create microservice for user management"));
        assertTrue(content.contains("Task Status:"));
        assertTrue(content.contains(TaskStatus.EXECUTING.toString()));
        assertTrue(content.contains("Constraints:"));
        assertTrue(content.contains("SCOPE"));
        assertTrue(content.contains("Only backend API"));
        assertTrue(content.contains("Recent Clarifications:"));
        assertTrue(content.contains("Database preference?"));
        assertTrue(content.contains("PostgreSQL"));
    }

    @Test
    @DisplayName("buildContext: session ID is passed to message")
    void testBuildContext_sessionIdInMessage() {
        // Arrange
        TaskStateDTO taskState = new TaskStateDTO();
        taskState.setSessionId(testSessionId);
        taskState.setGoal("Test goal");
        taskState.setStatus(TaskStatus.CLARIFYING);
        taskState.setConstraints(new ArrayList<>());
        taskState.setClarifications(new ArrayList<>());
        
        when(taskStateService.getTaskState(testSessionId)).thenReturn(taskState);

        ChatRequest.ModelSettings settings = new ChatRequest.ModelSettings();

        // Act
        List<ChatMessageDTO> result = contextStrategy.buildContext(testSessionId, settings);

        // Assert
        assertNotNull(result);
        assertFalse(result.isEmpty());
        assertEquals(testSessionId, result.get(0).getSessionId());
    }

    @Test
    @DisplayName("buildContext: role is system")
    void testBuildContext_roleIsSystem() {
        // Arrange
        TaskStateDTO taskState = new TaskStateDTO();
        taskState.setSessionId(testSessionId);
        taskState.setGoal("Test goal");
        taskState.setStatus(TaskStatus.CLARIFYING);
        taskState.setConstraints(new ArrayList<>());
        taskState.setClarifications(new ArrayList<>());
        
        when(taskStateService.getTaskState(testSessionId)).thenReturn(taskState);

        ChatRequest.ModelSettings settings = new ChatRequest.ModelSettings();

        // Act
        List<ChatMessageDTO> result = contextStrategy.buildContext(testSessionId, settings);

        // Assert
        assertNotNull(result);
        assertFalse(result.isEmpty());
        assertEquals("system", result.get(0).getRole());
    }
}
