package com.aichat.service;

import com.aichat.dto.ClarificationDTO;
import com.aichat.dto.ConstraintDTO;
import com.aichat.dto.TaskStateDTO;
import com.aichat.entity.TaskState;
import com.aichat.entity.TaskStatus;
import com.aichat.repository.TaskStateRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;

import java.time.Instant;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Comprehensive unit tests for TaskStateService.
 * Tests CRUD operations for task state management.
 */
@DisplayName("TaskStateService Unit Tests")
@SpringBootTest(classes = TaskStateService.class)
class TaskStateServiceTest {

    @Autowired
    private TaskStateService taskStateService;

    @MockBean
    private TaskStateRepository repository;

    @MockBean
    private ObjectMapper objectMapper;

    private final String testSessionId = "test-session-123";
    private final Instant testTime = Instant.now();

    @BeforeEach
    void setUp() throws Exception {
        // Setup ObjectMapper mocks for JSON serialization/deserialization
        when(objectMapper.readValue(any(String.class), any(com.fasterxml.jackson.core.type.TypeReference.class)))
            .thenAnswer(invocation -> {
                String json = invocation.getArgument(0);
                if (json == null || json.trim().isEmpty() || json.equals("[]")) {
                    return new java.util.ArrayList<>();
                }
                // Simple mock deserialization - return empty list for tests
                return new java.util.ArrayList<>();
            });
        
        when(objectMapper.writeValueAsString(any()))
            .thenReturn("[]");
    }

    @Test
    @DisplayName("getOrCreateTaskState: creates new TaskState when not exists")
    void testGetOrCreateTaskState_createsNew() {
        // Arrange
        when(repository.findBySessionId(testSessionId)).thenReturn(Optional.empty());
        
        TaskState newState = new TaskState();
        newState.setId(1L);
        newState.setSessionId(testSessionId);
        newState.setGoal("");
        newState.setStatus(TaskStatus.CLARIFYING);
        newState.setConstraintsJson("[]");
        newState.setClarificationsJson("[]");
        newState.setCreatedAt(testTime);
        newState.setUpdatedAt(testTime);
        
        when(repository.save(any(TaskState.class))).thenReturn(newState);

        // Act
        TaskStateDTO result = taskStateService.getOrCreateTaskState(testSessionId);

        // Assert
        assertNotNull(result);
        assertEquals(testSessionId, result.getSessionId());
        assertEquals(TaskStatus.CLARIFYING, result.getStatus());
        assertEquals("", result.getGoal());
        
        // Verify repository was called to save new state
        verify(repository, times(1)).save(any(TaskState.class));
    }

    @Test
    @DisplayName("updateGoal: updates goal for existing TaskState")
    void testUpdateGoal() {
        // Arrange
        String newGoal = "Implement user authentication feature";
        TaskState existingState = new TaskState();
        existingState.setId(1L);
        existingState.setSessionId(testSessionId);
        existingState.setGoal("Old goal");
        existingState.setStatus(TaskStatus.CLARIFYING);
        existingState.setConstraintsJson("[]");
        existingState.setClarificationsJson("[]");
        existingState.setCreatedAt(testTime);
        existingState.setUpdatedAt(testTime);
        
        when(repository.findBySessionId(testSessionId)).thenReturn(Optional.of(existingState));
        when(repository.save(any(TaskState.class))).thenAnswer(invocation -> {
            TaskState saved = invocation.getArgument(0);
            saved.setUpdatedAt(testTime.plusSeconds(60));
            return saved;
        });

        // Act
        TaskStateDTO result = taskStateService.updateGoal(testSessionId, newGoal);

        // Assert
        assertNotNull(result);
        assertEquals(newGoal, result.getGoal());
        
        // Verify the goal was updated
        ArgumentCaptor<TaskState> captor = ArgumentCaptor.forClass(TaskState.class);
        verify(repository, times(1)).save(captor.capture());
        TaskState savedState = captor.getValue();
        assertEquals(newGoal, savedState.getGoal());
    }

    @Test
    @DisplayName("addConstraint: adds constraint to TaskState")
    void testAddConstraint() throws Exception {
        // Arrange
        ConstraintDTO constraint = new ConstraintDTO("TECHNICAL", "Must use Spring Boot 3.2", false);
        TaskState existingState = new TaskState();
        existingState.setId(1L);
        existingState.setSessionId(testSessionId);
        existingState.setGoal("Test goal");
        existingState.setStatus(TaskStatus.CLARIFYING);
        existingState.setConstraintsJson("[]");
        existingState.setClarificationsJson("[]");
        existingState.setCreatedAt(testTime);
        existingState.setUpdatedAt(testTime);
        
        when(repository.findBySessionId(testSessionId)).thenReturn(Optional.of(existingState));
        
        // Mock deserialization to return empty list first, then list with new constraint
        when(objectMapper.readValue(eq("[]"), any(com.fasterxml.jackson.core.type.TypeReference.class)))
            .thenReturn(new java.util.ArrayList<>());
        when(objectMapper.writeValueAsString(any())).thenReturn("[{\"type\":\"TECHNICAL\",\"description\":\"Must use Spring Boot 3.2\",\"isViolated\":false}]");
        
        when(repository.save(any(TaskState.class))).thenAnswer(invocation -> {
            TaskState saved = invocation.getArgument(0);
            saved.setUpdatedAt(testTime.plusSeconds(60));
            return saved;
        });

        // Act
        TaskStateDTO result = taskStateService.addConstraint(testSessionId, constraint);

        // Assert
        assertNotNull(result);
        
        // Verify repository save was called
        verify(repository, times(1)).save(any(TaskState.class));
        
        // Verify ObjectMapper was called to serialize constraints
        verify(objectMapper, times(1)).writeValueAsString(any());
    }

    @Test
    @DisplayName("addClarification: adds clarification to TaskState")
    void testAddClarification() throws Exception {
        // Arrange
        String question = "What is the target audience?";
        String answer = "Enterprise customers";
        TaskState existingState = new TaskState();
        existingState.setId(1L);
        existingState.setSessionId(testSessionId);
        existingState.setGoal("Test goal");
        existingState.setStatus(TaskStatus.CLARIFYING);
        existingState.setConstraintsJson("[]");
        existingState.setClarificationsJson("[]");
        existingState.setCreatedAt(testTime);
        existingState.setUpdatedAt(testTime);
        
        when(repository.findBySessionId(testSessionId)).thenReturn(Optional.of(existingState));
        
        // Mock deserialization to return empty list
        when(objectMapper.readValue(eq("[]"), any(com.fasterxml.jackson.core.type.TypeReference.class)))
            .thenReturn(new java.util.ArrayList<>());
        when(objectMapper.writeValueAsString(any())).thenReturn("[{\"question\":\"What is the target audience?\",\"answer\":\"Enterprise customers\",\"timestamp\":\"2024-01-01T12:00\"}]");
        
        when(repository.save(any(TaskState.class))).thenAnswer(invocation -> {
            TaskState saved = invocation.getArgument(0);
            saved.setUpdatedAt(testTime.plusSeconds(60));
            return saved;
        });

        // Act
        TaskStateDTO result = taskStateService.addClarification(testSessionId, question, answer);

        // Assert
        assertNotNull(result);
        
        // Verify repository save was called
        verify(repository, times(1)).save(any(TaskState.class));
        
        // Verify ObjectMapper was called to serialize clarifications
        verify(objectMapper, times(1)).writeValueAsString(any());
    }

    @Test
    @DisplayName("deleteTaskState: deletes TaskState by sessionId")
    void testDeleteTaskState() {
        // Arrange
        doNothing().when(repository).deleteBySessionId(testSessionId);

        // Act
        taskStateService.deleteTaskState(testSessionId);

        // Assert
        verify(repository, times(1)).deleteBySessionId(testSessionId);
    }

    @Test
    @DisplayName("getTaskState: throws exception when not found")
    void testGetTaskState_notFound() {
        // Arrange
        when(repository.findBySessionId(testSessionId)).thenReturn(Optional.empty());

        // Act & Assert
        RuntimeException exception = assertThrows(
            RuntimeException.class,
            () -> taskStateService.getTaskState(testSessionId),
            "Should throw RuntimeException when TaskState not found"
        );
        assertTrue(exception.getMessage().contains("TaskState not found"));
        assertTrue(exception.getMessage().contains(testSessionId));
    }

    @Test
    @DisplayName("updateGoal: throws exception when TaskState not found")
    void testUpdateGoal_notFound() {
        // Arrange
        when(repository.findBySessionId(testSessionId)).thenReturn(Optional.empty());

        // Act & Assert
        RuntimeException exception = assertThrows(
            RuntimeException.class,
            () -> taskStateService.updateGoal(testSessionId, "New goal"),
            "Should throw RuntimeException when TaskState not found"
        );
        assertTrue(exception.getMessage().contains("TaskState not found"));
    }

    @Test
    @DisplayName("getOrCreateTaskState: returns existing TaskState when found")
    void testGetOrCreateTaskState_returnsExisting() {
        // Arrange
        TaskState existingState = new TaskState();
        existingState.setId(1L);
        existingState.setSessionId(testSessionId);
        existingState.setGoal("Existing goal");
        existingState.setStatus(TaskStatus.EXECUTING);
        existingState.setConstraintsJson("[]");
        existingState.setClarificationsJson("[]");
        existingState.setCreatedAt(testTime);
        existingState.setUpdatedAt(testTime);
        
        when(repository.findBySessionId(testSessionId)).thenReturn(Optional.of(existingState));

        // Act
        TaskStateDTO result = taskStateService.getOrCreateTaskState(testSessionId);

        // Assert
        assertNotNull(result);
        assertEquals("Existing goal", result.getGoal());
        assertEquals(TaskStatus.EXECUTING, result.getStatus());
        
        // Verify save was NOT called (state already exists)
        verify(repository, never()).save(any(TaskState.class));
    }
}
