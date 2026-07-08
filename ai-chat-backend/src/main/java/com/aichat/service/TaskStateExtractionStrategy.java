package com.aichat.service;

import com.aichat.dto.ClarificationDTO;
import com.aichat.dto.ConstraintDTO;
import com.aichat.entity.TaskStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Сервис для автоматического извлечения состояния задачи из диалога с пользователем.
 * Извлекает: goal, status, constraints, clarifications.
 */
@Service
public class TaskStateExtractionStrategy {

    private static final Logger logger = LoggerFactory.getLogger(TaskStateExtractionStrategy.class);

    // Паттерны для определения статуса диалога
    private static final Pattern CLARIFYING_PATTERN = Pattern.compile(
        "(\\?|уточните|какой|какая|какое|какие|что.*выбрать|как.*выбрать|какой.*использовать|предпочитаете|нужно.*знать)",
        Pattern.CASE_INSENSITIVE
    );

    private static final Pattern PLANNING_PATTERN = Pattern.compile(
        "(план|архитектура|шаги|структура|спроектирую|спланирую|предлагаю.*сделать|сначала.*потом|последовательность|этапы)",
        Pattern.CASE_INSENSITIVE
    );

    private static final Pattern EXECUTING_PATTERN = Pattern.compile(
        "(код|реализую|создаю.*файл|пишу.*код|добавляю.*класс|создаю.*класс|имплементирую|начинаю.*реализацию|код.*готов|файл.*создан)",
        Pattern.CASE_INSENSITIVE
    );

    private static final Pattern DONE_PATTERN = Pattern.compile(
        "(готово|завершено|все.*тесты.*проходят|реализация.*завершена|работа.*завершена|выполнено|успешно.*выполнено)",
        Pattern.CASE_INSENSITIVE
    );

    // Паттерны для извлечения ограничений
    private static final Pattern CONSTRAINT_NOT_USE = Pattern.compile(
        "(не.*используй|не.*использовать|avoid.*|don't.*use|without.*|no.*\\s+\\w+)",
        Pattern.CASE_INSENSITIVE
    );

    private static final Pattern CONSTRAINT_ONLY = Pattern.compile(
        "(только.*|only.*|exclusively.*)",
        Pattern.CASE_INSENSITIVE
    );

    private static final Pattern CONSTRAINT_WITHOUT = Pattern.compile(
        "(без.*|without.*|excluding.*)",
        Pattern.CASE_INSENSITIVE
    );

    /**
     * Результат извлечения состояния задачи.
     */
    public static class ExtractionResult {
        private String goal;
        private TaskStatus status;
        private List<ConstraintDTO> constraints;
        private List<ClarificationDTO> clarifications;

        public ExtractionResult() {
            this.constraints = new ArrayList<>();
            this.clarifications = new ArrayList<>();
        }

        public String getGoal() {
            return goal;
        }

        public void setGoal(String goal) {
            this.goal = goal;
        }

        public TaskStatus getStatus() {
            return status;
        }

        public void setStatus(TaskStatus status) {
            this.status = status;
        }

        public List<ConstraintDTO> getConstraints() {
            return constraints;
        }

        public void setConstraints(List<ConstraintDTO> constraints) {
            this.constraints = constraints;
        }

        public List<ClarificationDTO> getClarifications() {
            return clarifications;
        }

        public void setClarifications(List<ClarificationDTO> clarifications) {
            this.clarifications = clarifications;
        }
    }

    /**
     * Извлекает состояние задачи из истории диалога и текущего сообщения.
     *
     * @param conversationHistory История диалога в формате "User: ...\nAI: ...\nUser: ..."
     * @param currentMessage      Текущее сообщение (последнее)
     * @return ExtractionResult с извлеченными goal, status, constraints, clarifications
     */
    public ExtractionResult extractTaskState(String conversationHistory, String currentMessage) {
        logger.debug("Extracting task state from conversation history (length={}) and current message (length={})",
                conversationHistory != null ? conversationHistory.length() : 0,
                currentMessage != null ? currentMessage.length() : 0);

        ExtractionResult result = new ExtractionResult();

        // 1. Извлекаем goal из первого сообщения пользователя или currentMessage
        result.setGoal(extractGoal(conversationHistory, currentMessage));

        // 2. Определяем статус по последнему сообщению AI
        result.setStatus(determineStatus(conversationHistory, currentMessage));

        // 3. Извлекаем ограничения из всех сообщений пользователя + currentMessage
        result.setConstraints(extractConstraints(conversationHistory, currentMessage));

        // 4. Извлекаем clarifications (ответы на вопросы AI)
        result.setClarifications(extractClarifications(conversationHistory));

        logger.info("Task state extracted: goal='{}', status={}, constraints={}, clarifications={}",
                result.getGoal(), result.getStatus(),
                result.getConstraints().size(), result.getClarifications().size());

        return result;
    }

    /**
     * Извлекает цель задачи из первого сообщения пользователя или currentMessage.
     */
    private String extractGoal(String conversationHistory, String currentMessage) {
        // Сначала пробуем извлечь из conversation history
        if (conversationHistory != null && !conversationHistory.trim().isEmpty()) {
            String[] lines = conversationHistory.split("\n");
            for (String line : lines) {
                // Ищем первое сообщение пользователя
                if (line.trim().startsWith("User:") || line.trim().startsWith("Пользователь:")) {
                    String message = line.replaceFirst("^(User:|Пользователь:)", "").trim();
                    if (!message.isEmpty()) {
                        String goal = normalizeGoal(message);
                        logger.debug("Extracted goal from first user message: '{}'", goal);
                        return goal;
                    }
                }
            }
        }

        // Если история пуста или не содержит сообщения пользователя, используем currentMessage
        if (currentMessage != null && !currentMessage.trim().isEmpty()) {
            String goal = normalizeGoal(currentMessage);
            logger.debug("Extracted goal from currentMessage: '{}'", goal);
            return goal;
        }

        logger.debug("No user goal found in conversation history or currentMessage");
        return "";
    }

    /**
     * Нормализует текст цели - убирает лишние слова, оставляет суть.
     */
    private String normalizeGoal(String message) {
        // Убираем вводные слова
        String normalized = message
                .replaceAll("(?i)^(пожалуйста|нужно|необходимо|сделай|напиши|создай|реализуй|давай|хочу)", "")
                .trim();

        // Убираем конечные знаки препинания
        normalized = normalized.replaceAll("[.!?]+$", "").trim();

        // Capitalize first letter
        if (!normalized.isEmpty() && Character.isLowerCase(normalized.charAt(0))) {
            normalized = Character.toUpperCase(normalized.charAt(0)) + normalized.substring(1);
        }

        return normalized;
    }

    /**
     * Определяет статус диалога по ключевым словам в сообщениях AI.
     */
    private TaskStatus determineStatus(String conversationHistory, String currentMessage) {
        // Проверяем текущее сообщение (если это сообщение AI)
        if (currentMessage != null && !currentMessage.trim().isEmpty()) {
            logger.debug("Checking currentMessage: '{}'", currentMessage);
            TaskStatus status = detectStatusInText(currentMessage);
            if (status != null) {
                logger.debug("Status detected from current message: {}", status);
                return status;
            }
        }

        // Если не определили по текущему, ищем последнее сообщение AI в истории
        if (conversationHistory != null && !conversationHistory.trim().isEmpty()) {
            String[] lines = conversationHistory.split("\n");
            logger.debug("Checking {} lines in conversation history", lines.length);
            
            // Ищем с конца, чтобы найти последнее сообщение AI
            for (int i = lines.length - 1; i >= 0; i--) {
                String line = lines[i].trim();
                logger.debug("Line {}: '{}'", i, line);
                
                // Проверяем сообщение AI с префиксом или без
                String aiMessage = null;
                if (line.startsWith("AI:") || line.startsWith("Assistant:")) {
                    aiMessage = line.replaceFirst("^(AI:|Assistant:)", "").trim();
                    logger.debug("Extracted AI message (prefix): '{}'", aiMessage);
                } else if (line.startsWith("AI ") || line.startsWith("Assistant ")) {
                    aiMessage = line.replaceFirst("^(AI|Assistant)\\s+", "").trim();
                    logger.debug("Extracted AI message (space): '{}'", aiMessage);
                } else if (!line.startsWith("User:") && !line.startsWith("Пользователь:") && 
                           !line.startsWith("User ") && !line.startsWith("Пользователь ")) {
                    // Если строка не от пользователя, считаем что это AI
                    aiMessage = line;
                    logger.debug("Extracted AI message (no prefix): '{}'", aiMessage);
                }
                
                if (aiMessage != null && !aiMessage.isEmpty()) {
                    TaskStatus status = detectStatusInText(aiMessage);
                    if (status != null) {
                        logger.debug("Status detected from AI history message: {}", status);
                        return status;
                    }
                    logger.debug("No status detected in: '{}'", aiMessage);
                }
            }
        }

        // По умолчанию возвращаем CLARIFYING
        logger.debug("Status not detected, defaulting to CLARIFYING");
        return TaskStatus.CLARIFYING;
    }

    /**
     * Detects status from text using pattern matching.
     */
    private TaskStatus detectStatusInText(String text) {
        if (text == null || text.isEmpty()) {
            return null;
        }

        String lowerText = text.toLowerCase();
        
        // Проверяем паттерны в порядке приоритета
        // DONE имеет высший приоритет (завершение работы)
        if (DONE_PATTERN.matcher(text).find() || 
            lowerText.contains("готово") || lowerText.contains("завершено") ||
            lowerText.contains("done") || lowerText.contains("complete") || lowerText.contains("finished")) {
            return TaskStatus.DONE;
        }

        // EXECUTING - код пишется
        if (EXECUTING_PATTERN.matcher(text).find() || 
            lowerText.contains("код") || lowerText.contains("создаю") ||
            lowerText.contains("code") || lowerText.contains("creating") || lowerText.contains("implementing")) {
            return TaskStatus.EXECUTING;
        }

        // PLANNING - планируется структура
        if (PLANNING_PATTERN.matcher(text).find() || 
            lowerText.contains("план") || lowerText.contains("план:") ||
            lowerText.contains("plan") || lowerText.contains("architecture") || lowerText.contains("steps")) {
            return TaskStatus.PLANNING;
        }

        // CLARIFYING - задаются вопросы
        if (CLARIFYING_PATTERN.matcher(text).find() || text.contains("?") || lowerText.contains("what") || lowerText.contains("which")) {
            return TaskStatus.CLARIFYING;
        }

        return null;
    }

    /**
     * Извлекает ограничения из всех сообщений пользователя.
     */
    private List<ConstraintDTO> extractConstraints(String conversationHistory, String currentMessage) {
        List<ConstraintDTO> constraints = new ArrayList<>();

        // Извлекаем goal для последующей проверки на дубликаты
        String goal = extractGoal(conversationHistory, currentMessage);

        // Сначала извлекаем из conversation history
        if (conversationHistory != null && !conversationHistory.trim().isEmpty()) {
            constraints.addAll(extractConstraintsFromText(conversationHistory, goal));
        }

        // Затем извлекаем из currentMessage (если есть)
        if (currentMessage != null && !currentMessage.trim().isEmpty()) {
            constraints.addAll(extractConstraintsFromText(currentMessage, goal));
        }

        return constraints;
    }

    /**
     * Извлекает ограничения из текста (сообщения пользователя).
     */
    private List<ConstraintDTO> extractConstraintsFromText(String text, String goal) {
        List<ConstraintDTO> constraints = new ArrayList<>();

        if (text == null || text.trim().isEmpty()) {
            return constraints;
        }

        String[] lines = text.split("\n");
        for (String line : lines) {
            String message = line.trim();
            
            // Проверяем сообщения пользователя с префиксом или без
            if (message.startsWith("User:") || message.startsWith("Пользователь:")) {
                message = message.replaceFirst("^(User:|Пользователь:)", "").trim();
                constraints.addAll(extractConstraintsFromMessage(message, goal));
            }
            // Если нет префикса - считаем что это чистое сообщение пользователя
            else if (!message.isEmpty() && !message.startsWith("AI:") && !message.startsWith("Assistant:")) {
                constraints.addAll(extractConstraintsFromMessage(message, goal));
            }
        }

        return constraints;
    }

    /**
     * Извлекает ограничения из одного сообщения.
     */
    private List<ConstraintDTO> extractConstraintsFromMessage(String message, String goal) {
        List<ConstraintDTO> constraints = new ArrayList<>();

        if (message == null || message.trim().isEmpty()) {
            return constraints;
        }

        // Ищем паттерны ограничений
        List<String> foundConstraints = new ArrayList<>();

        // "не используй X" - извлекаем всю фразу
        Matcher notUseMatcher = CONSTRAINT_NOT_USE.matcher(message);
        while (notUseMatcher.find()) {
            String constraint = extractFullConstraintPhrase(message, notUseMatcher.start());
            if (!constraint.isEmpty() && !foundConstraints.contains(constraint)) {
                foundConstraints.add(constraint);
            }
        }

        // "только Y" - извлекаем всю фразу
        Matcher onlyMatcher = CONSTRAINT_ONLY.matcher(message);
        while (onlyMatcher.find()) {
            String constraint = extractFullConstraintPhrase(message, onlyMatcher.start());
            if (!constraint.isEmpty() && !foundConstraints.contains(constraint)) {
                foundConstraints.add(constraint);
            }
        }

        // "без Z" - извлекаем всю фразу
        Matcher withoutMatcher = CONSTRAINT_WITHOUT.matcher(message);
        while (withoutMatcher.find()) {
            String constraint = extractFullConstraintPhrase(message, withoutMatcher.start());
            if (!constraint.isEmpty() && !foundConstraints.contains(constraint)) {
                foundConstraints.add(constraint);
            }
        }

        // Добавляем найденные ограничения, исключая те что являются подстрокой goal
        for (String constraintText : foundConstraints) {
            // Пропускаем ограничение если оно содержится в goal (чтобы избежать дублирования)
            if (goal != null && !goal.isEmpty() && goal.toLowerCase().contains(constraintText.toLowerCase())) {
                logger.debug("Skipping constraint '{}' as it is part of goal '{}'", constraintText, goal);
                continue;
            }
            
            ConstraintDTO constraint = new ConstraintDTO();
            constraint.setType(determineConstraintType(constraintText));
            constraint.setDescription(constraintText);
            constraint.setIsViolated(false);
            constraints.add(constraint);
            logger.debug("Extracted constraint: {}", constraintText);
        }

        return constraints;
    }

    /**
     * Извлекает полную фразу ограничения начиная от указанной позиции.
     */
    private String extractFullConstraintPhrase(String message, int startPos) {
        // Ищем начало фразы (идем назад до начала предложения или запятой)
        int phraseStart = startPos;
        while (phraseStart > 0) {
            char c = message.charAt(phraseStart - 1);
            if (c == '.' || c == ';' || c == ':' || c == '!') {
                phraseStart++; // пропускаем разделитель
                break;
            }
            phraseStart--;
        }

        // Ищем конец фразы (до точки, запятой или конца сообщения)
        int phraseEnd = startPos;
        while (phraseEnd < message.length()) {
            char c = message.charAt(phraseEnd);
            if (c == '.' || c == ';' || c == '!' || c == '?') {
                break;
            }
            phraseEnd++;
        }

        // Извлекаем фразу и чистим от лишних пробелов
        String phrase = message.substring(phraseStart, phraseEnd).trim();
        
        // Убираем конечные знаки препинания
        phrase = phrase.replaceAll("[.!?;:]+$", "").trim();
        
        return phrase;
    }

    /**
     * Определяет тип ограничения по тексту.
     */
    private String determineConstraintType(String constraintText) {
        String lower = constraintText.toLowerCase();

        if (lower.contains("не используй") || lower.contains("не использовать") ||
            lower.contains("avoid") || lower.contains("don't use") || lower.contains("without")) {
            return "TECHNICAL";
        }

        if (lower.contains("только") || lower.contains("only") || lower.contains("exclusively")) {
            return "TECHNICAL";
        }

        if (lower.contains("без") || lower.contains("without")) {
            return "TECHNICAL";
        }

        // По умолчанию TECHNICAL
        return "TECHNICAL";
    }

    /**
     * Извлекает clarifications - пары вопрос-ответ из диалога.
     */
    private List<ClarificationDTO> extractClarifications(String conversationHistory) {
        List<ClarificationDTO> clarifications = new ArrayList<>();

        if (conversationHistory == null || conversationHistory.trim().isEmpty()) {
            return clarifications;
        }

        String[] lines = conversationHistory.split("\n");
        String lastAiQuestion = null;

        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].trim();

            // Проверяем, задал ли AI вопрос
            if (line.startsWith("AI:") || line.startsWith("Assistant:")) {
                String aiMessage = line.replaceFirst("^(AI:|Assistant:)", "").trim();
                // Если сообщение содержит "?", AI задал вопрос
                if (aiMessage.contains("?")) {
                    lastAiQuestion = aiMessage;
                    logger.debug("AI asked question at line {}: '{}'", i,
                            aiMessage.substring(0, Math.min(50, aiMessage.length())));
                }
            }
            // Если AI задал вопрос, следующее сообщение пользователя - ответ
            else if (lastAiQuestion != null && (line.startsWith("User:") || line.startsWith("Пользователь:"))) {
                String userMessage = line.replaceFirst("^(User:|Пользователь:)", "").trim();
                if (!userMessage.isEmpty()) {
                    ClarificationDTO clarification = new ClarificationDTO(lastAiQuestion, userMessage, Instant.now());
                    clarifications.add(clarification);
                    logger.debug("Extracted clarification Q&A: Q='{}' A='{}'", lastAiQuestion, userMessage);
                }
                lastAiQuestion = null;
            }
            // Если сообщение не от пользователя и не AI с вопросом, сбрасываем
            else if (!line.isEmpty() && !line.startsWith("User:") && !line.startsWith("Пользователь:")) {
                lastAiQuestion = null;
            }
        }

        return clarifications;
    }
}
