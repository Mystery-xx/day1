package com.aichat.service;

import com.aichat.dto.TaskContext;
import com.aichat.dto.ChatMessageDTO;
import com.aichat.enums.TaskState;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.regex.Pattern;

/**
 * Detects automatic state transitions based on message content and context.
 * Uses keyword detection and pattern matching to identify transition triggers.
 */
@Component
public class AutoTransitionDetector {
    
    // Keywords for Planning → Execution transition
    private static final Set<String> PLANNING_TO_EXECUTION_KEYWORDS = Set.of(
        "согласен", "ok", "окей", "приступаю", "план хороший", "утверждаю",
        "подтверждаю", "давай", "начинай", "реализуй"
    );
    
    // Keywords for Execution → Validation transition
    private static final Set<String> EXECUTION_TO_VALIDATION_KEYWORDS = Set.of(
        "готово", "реализовал", "сделал", "завершил", "выполнил"
    );
    
    // Keywords for Validation → Done transition    
    private static final Set<String> VALIDATION_TO_DONE_KEYWORDS = Set.of(
        "доволен", "всё готово", "принято", "одобряю", "отлично", "прекрасно"
    );
    
    // Keywords for Validation → Planning (revision needed)
    private static final Set<String> VALIDATION_TO_PLANNING_KEYWORDS = Set.of(
        "не доволен", "нужно уточнить", "ошибка", "проблема", "исправь",
        "переделай", "неверно", "неправильно"
    );
    
    // Keywords for Done → Planning (new requirements)
    private static final Set<String> DONE_TO_PLANNING_KEYWORDS = Set.of(
        "нужно дополнить", "добавить функцию", "хочу ещё", "изменить",
        "новая задача", "дополнение"
    );
    
    // Pattern to detect code blocks
    private static final Pattern CODE_BLOCK_PATTERN = Pattern.compile("```[\\s\\S]*?```");
    
    /**
     * Detect if a transition should occur based on message content and context.
     * @param context Current task context
     * @param message User message
     * @return Optional containing target state if transition detected, empty otherwise
     */
    public Optional<TaskState> detect(TaskContext context, ChatMessageDTO message) {
        if (message == null || message.getContent() == null) {
            return Optional.empty();
        }
        
        String content = message.getContent().toLowerCase();
        TaskState currentState = context.getCurrentState();
        
        return switch (currentState) {
            case PLANNING -> detectPlanningTransition(content);
            case EXECUTION -> detectExecutionTransition(content);
            case VALIDATION -> detectValidationTransition(content);
            case DONE -> detectDoneTransition(content);
        };
    }
    
    private Optional<TaskState> detectPlanningTransition(String content) {
        if (containsKeyword(content, PLANNING_TO_EXECUTION_KEYWORDS)) {
            return Optional.of(TaskState.EXECUTION);
        }
        return Optional.empty();
    }
    
    private Optional<TaskState> detectExecutionTransition(String content) {
        if (containsKeyword(content, EXECUTION_TO_VALIDATION_KEYWORDS) &&
            hasCodeBlock(content)) {
            return Optional.of(TaskState.VALIDATION);
        }
        return Optional.empty();
    }
    
    private Optional<TaskState> detectValidationTransition(String content) {
        if (containsKeyword(content, VALIDATION_TO_DONE_KEYWORDS)) {
            return Optional.of(TaskState.DONE);
        }
        if (containsKeyword(content, VALIDATION_TO_PLANNING_KEYWORDS)) {
            return Optional.of(TaskState.PLANNING);
        }
        return Optional.empty();
    }
    
    private Optional<TaskState> detectDoneTransition(String content) {
        if (containsKeyword(content, DONE_TO_PLANNING_KEYWORDS)) {
            return Optional.of(TaskState.PLANNING);
        }
        return Optional.empty();
    }
    
    private boolean containsKeyword(String content, Set<String> keywords) {
        return keywords.stream().anyMatch(content::contains);
    }
    
    private boolean hasCodeBlock(String content) {
        return CODE_BLOCK_PATTERN.matcher(content).find();
    }
}
