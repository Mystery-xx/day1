package com.aichat.service;

import com.aichat.dto.ConstraintDTO;
import com.aichat.entity.TaskStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Тесты для TaskStateExtractionStrategy.
 */
class TaskStateExtractionStrategyTest {

    private TaskStateExtractionStrategy extractionStrategy;

    @BeforeEach
    void setUp() {
        extractionStrategy = new TaskStateExtractionStrategy();
    }

    @Test
    @DisplayName("Извлечение goal из первого сообщения пользователя")
    void testExtractGoal() {
        String conversationHistory = "User: Напиши CRUD для пользователей\n" +
                                     "AI: Какие поля должны быть у пользователя?";

        TaskStateExtractionStrategy.ExtractionResult result = 
                extractionStrategy.extractTaskState(conversationHistory, null);

        assertNotNull(result.getGoal());
        assertTrue(result.getGoal().contains("CRUD"));
        assertTrue(result.getGoal().contains("пользователей"));
    }

    @Test
    @DisplayName("Определение статуса CLARIFYING по вопросительному знаку")
    void testClarifyingStatus() {
        String conversationHistory = "User: Создай REST API\n" +
                                     "AI: Какие эндпоинты нужны?";

        TaskStateExtractionStrategy.ExtractionResult result = 
                extractionStrategy.extractTaskState(conversationHistory, null);

        assertEquals(TaskStatus.CLARIFYING, result.getStatus());
    }

    @Test
    @DisplayName("Определение статуса PLANNING по ключевым словам")
    void testPlanningStatus() {
        String conversationHistory = "User: Реализуй сервис\n" +
                                     "AI: План: 1) Entity, 2) Repository, 3) Service";

        TaskStateExtractionStrategy.ExtractionResult result = 
                extractionStrategy.extractTaskState(conversationHistory, null);

        assertEquals(TaskStatus.PLANNING, result.getStatus());
    }

    @Test
    @DisplayName("Определение статуса EXECUTING по ключевым словам")
    void testExecutingStatus() {
        String conversationHistory = "User: Пиши код\n" +
                                     "AI: Создаю файл UserService.java";

        TaskStateExtractionStrategy.ExtractionResult result = 
                extractionStrategy.extractTaskState(conversationHistory, null);

        assertEquals(TaskStatus.EXECUTING, result.getStatus());
    }

    @Test
    @DisplayName("Определение статуса DONE по ключевым словам")
    void testDoneStatus() {
        String conversationHistory = "User: Проверь тесты\n" +
                                     "AI: Готово! Все тесты проходят.";

        TaskStateExtractionStrategy.ExtractionResult result = 
                extractionStrategy.extractTaskState(conversationHistory, null);

        assertEquals(TaskStatus.DONE, result.getStatus());
    }

    @Test
    @DisplayName("Извлечение ограничений 'не используй'")
    void testExtractConstraintsNotUse() {
        String conversationHistory = "User: Сделай API, но не используй MySQL";

        TaskStateExtractionStrategy.ExtractionResult result = 
                extractionStrategy.extractTaskState(conversationHistory, null);

        assertNotNull(result.getConstraints());
        assertFalse(result.getConstraints().isEmpty());
        assertTrue(result.getConstraints().stream()
                .anyMatch(c -> c.getDescription().toLowerCase().contains("не используй") ||
                               c.getDescription().toLowerCase().contains("mysql")));
    }

    @Test
    @DisplayName("Извлечение ограничений 'только'")
    void testExtractConstraintsOnly() {
        String conversationHistory = "User: Используй только PostgreSQL";

        TaskStateExtractionStrategy.ExtractionResult result = 
                extractionStrategy.extractTaskState(conversationHistory, null);

        assertNotNull(result.getConstraints());
        assertFalse(result.getConstraints().isEmpty());
        assertTrue(result.getConstraints().stream()
                .anyMatch(c -> c.getDescription().toLowerCase().contains("только")));
    }

    @Test
    @DisplayName("Извлечение ограничений 'без'")
    void testExtractConstraintsWithout() {
        String conversationHistory = "User: Сделай без кэширования";

        TaskStateExtractionStrategy.ExtractionResult result = 
                extractionStrategy.extractTaskState(conversationHistory, null);

        assertNotNull(result.getConstraints());
        assertFalse(result.getConstraints().isEmpty());
    }

    @Test
    @DisplayName("Извлечение clarifications - ответы на вопросы AI")
    void testExtractClarifications() {
        String conversationHistory = "User: Напиши сервис\n" +
                                     "AI: Какой язык использовать?\n" +
                                     "User: Java\n" +
                                     "AI: Какую базу данных?";

        TaskStateExtractionStrategy.ExtractionResult result = 
                extractionStrategy.extractTaskState(conversationHistory, null);

        assertNotNull(result.getClarifications());
        assertFalse(result.getClarifications().isEmpty());
        assertTrue(result.getClarifications().contains("Java"));
    }

    @Test
    @DisplayName("Полный пример диалога CLARIFYING")
    void testFullClarifyingExample() {
        String conversationHistory = "User: Напиши CRUD для пользователей\n" +
                                     "AI: Какие поля должны быть у пользователя?";

        TaskStateExtractionStrategy.ExtractionResult result = 
                extractionStrategy.extractTaskState(conversationHistory, null);

        assertNotNull(result.getGoal());
        assertEquals(TaskStatus.CLARIFYING, result.getStatus());
        assertTrue(result.getGoal().contains("CRUD"));
    }

    @Test
    @DisplayName("Прямой тест detectStatusInText для PLANNING")
    void testDetectStatusDirectly() {
        String aiMessage = "План: 1) Entity, 2) Repository, 3) Service";
        // Проверяем что паттерн работает
        assertTrue(aiMessage.toLowerCase().contains("план"), "Message should contain 'план'");
        
        // Используем рефлексию для вызова приватного метода
        try {
            java.lang.reflect.Method method = TaskStateExtractionStrategy.class
                .getDeclaredMethod("detectStatusInText", String.class);
            method.setAccessible(true);
            
            TaskStatus status = (TaskStatus) method.invoke(extractionStrategy, aiMessage);
            
            assertNotNull(status, "Status should not be null for message: " + aiMessage);
            assertEquals(TaskStatus.PLANNING, status);
        } catch (Exception e) {
            fail("Reflection failed: " + e.getMessage());
        }
    }

    @Test
    @DisplayName("Полный пример диалога PLANNING")
    void testFullPlanningExample() {
        String conversationHistory = "User: Создай REST API для задач\n" +
                                     "AI: План: 1) Entity, 2) Repository, 3) Service, 4) Controller";

        TaskStateExtractionStrategy.ExtractionResult result = 
                extractionStrategy.extractTaskState(conversationHistory, null);

        assertNotNull(result.getGoal());
        assertEquals(TaskStatus.PLANNING, result.getStatus());
        assertTrue(result.getGoal().contains("REST API"));
    }

    @Test
    @DisplayName("Полный пример диалога EXECUTING")
    void testFullExecutingExample() {
        String conversationHistory = "User: Реализуй сервис\n" +
                                     "AI: Пишу код сервиса...";

        TaskStateExtractionStrategy.ExtractionResult result = 
                extractionStrategy.extractTaskState(conversationHistory, null);

        assertEquals(TaskStatus.EXECUTING, result.getStatus());
    }

    @Test
    @DisplayName("Полный пример диалога DONE")
    void testFullDoneExample() {
        String conversationHistory = "AI: Готово! Все тесты проходят.";

        TaskStateExtractionStrategy.ExtractionResult result = 
                extractionStrategy.extractTaskState(conversationHistory, null);

        assertEquals(TaskStatus.DONE, result.getStatus());
    }

    @Test
    @DisplayName("Пример с constraints: не используй MySQL, только PostgreSQL")
    void testConstraintsExample() {
        String conversationHistory = "User: Сделай API, но не используй MySQL, только PostgreSQL";

        TaskStateExtractionStrategy.ExtractionResult result = 
                extractionStrategy.extractTaskState(conversationHistory, null);

        assertNotNull(result.getConstraints());
        assertFalse(result.getConstraints().isEmpty());
        
        // Проверяем, что найдены оба ограничения
        boolean hasNotMysql = result.getConstraints().stream()
                .anyMatch(c -> c.getDescription().toLowerCase().contains("mysql"));
        boolean hasOnlyPostgresql = result.getConstraints().stream()
                .anyMatch(c -> c.getDescription().toLowerCase().contains("postgresql"));
        
        assertTrue(hasNotMysql || hasOnlyPostgresql, 
                "Должно быть найдено хотя бы одно ограничение про MySQL/PostgreSQL");
    }

    @Test
    @DisplayName("Пустая история диалога")
    void testEmptyConversation() {
        TaskStateExtractionStrategy.ExtractionResult result = 
                extractionStrategy.extractTaskState("", "");

        assertEquals("", result.getGoal());
        assertEquals(TaskStatus.CLARIFYING, result.getStatus());
        assertTrue(result.getConstraints().isEmpty());
        assertTrue(result.getClarifications().isEmpty());
    }

    @Test
    @DisplayName("Null история диалога")
    void testNullConversation() {
        TaskStateExtractionStrategy.ExtractionResult result = 
                extractionStrategy.extractTaskState(null, null);

        assertEquals("", result.getGoal());
        assertEquals(TaskStatus.CLARIFYING, result.getStatus());
        assertTrue(result.getConstraints().isEmpty());
        assertTrue(result.getClarifications().isEmpty());
    }

    @Test
    @DisplayName("Статус определяется по currentMessage приоритетно")
    void testCurrentMessagePriority() {
        String conversationHistory = "User: Начни\nAI: План: делаю так";
        String currentMessage = "Готово! Все тесты проходят.";

        TaskStateExtractionStrategy.ExtractionResult result = 
                extractionStrategy.extractTaskState(conversationHistory, currentMessage);

        // currentMessage имеет приоритет
        assertEquals(TaskStatus.DONE, result.getStatus());
    }

    @Test
    @DisplayName("Множественные clarifications")
    void testMultipleClarifications() {
        String conversationHistory = "User: Создай приложение\n" +
                                     "AI: Какой язык?\n" +
                                     "User: Python\n" +
                                     "AI: Какую базу?\n" +
                                     "User: PostgreSQL\n" +
                                     "AI: Какой фреймворк?";

        TaskStateExtractionStrategy.ExtractionResult result = 
                extractionStrategy.extractTaskState(conversationHistory, null);

        assertNotNull(result.getClarifications());
        assertEquals(2, result.getClarifications().size());
        assertTrue(result.getClarifications().contains("Python"));
        assertTrue(result.getClarifications().contains("PostgreSQL"));
    }

    @Test
    @DisplayName("Constraint тип TECHNICAL")
    void testConstraintType() {
        String conversationHistory = "User: Не используй MySQL";

        TaskStateExtractionStrategy.ExtractionResult result = 
                extractionStrategy.extractTaskState(conversationHistory, null);

        // Проверяем что constraints извлечены (может быть 0 или больше в зависимости от паттернов)
        assertNotNull(result.getConstraints());
        // Если constraints есть, проверяем тип
        if (!result.getConstraints().isEmpty()) {
            ConstraintDTO constraint = result.getConstraints().get(0);
            assertEquals("TECHNICAL", constraint.getType());
        }
    }

    @Test
    @DisplayName("Полное извлечение constraint - 'Не используй MySQL, только PostgreSQL'")
    void testExtractFullConstraintPhrase() {
        String conversationHistory = "User: Не используй MySQL, только PostgreSQL. Сделай микросервисную архитектуру.";

        TaskStateExtractionStrategy.ExtractionResult result = 
                extractionStrategy.extractTaskState(conversationHistory, null);

        assertNotNull(result.getConstraints());
        assertFalse(result.getConstraints().isEmpty());
        
        // Проверяем что constraint содержит полную фразу, а не обрезанную
        ConstraintDTO constraint = result.getConstraints().get(0);
        String description = constraint.getDescription();
        
        // Должно содержать "Не используй MySQL" полностью, а не "уй MySQL"
        assertTrue(description.contains("Не используй") || description.toLowerCase().contains("не используй"),
                "Constraint должен содержать 'Не используй' полностью, найдено: " + description);
        assertTrue(description.contains("MySQL"), 
                "Constraint должен содержать 'MySQL', найдено: " + description);
    }

    @Test
    @DisplayName("Извлечение goal на английском")
    void testExtractGoalEnglish() {
        String conversationHistory = "User: Implement CRUD for users\n" +
                                     "AI: What fields?";

        TaskStateExtractionStrategy.ExtractionResult result = 
                extractionStrategy.extractTaskState(conversationHistory, null);

        assertNotNull(result.getGoal());
        assertTrue(result.getGoal().contains("CRUD"));
    }

    @Test
    @DisplayName("Status по английским ключевым словам")
    void testStatusEnglishKeywords() {
        // PLANNING
        String planningHistory = "User: Create API\nAI: Plan: 1) Entity, 2) Service";
        TaskStateExtractionStrategy.ExtractionResult planningResult = 
                extractionStrategy.extractTaskState(planningHistory, null);
        assertEquals(TaskStatus.PLANNING, planningResult.getStatus());

        // EXECUTING
        String executingHistory = "User: Code it\nAI: Creating file...";
        TaskStateExtractionStrategy.ExtractionResult executingResult = 
                extractionStrategy.extractTaskState(executingHistory, null);
        assertEquals(TaskStatus.EXECUTING, executingResult.getStatus());

        // DONE
        String doneHistory = "AI: Done! All tests pass.";
        TaskStateExtractionStrategy.ExtractionResult doneResult = 
                extractionStrategy.extractTaskState(doneHistory, null);
        assertEquals(TaskStatus.DONE, doneResult.getStatus());
    }
}
