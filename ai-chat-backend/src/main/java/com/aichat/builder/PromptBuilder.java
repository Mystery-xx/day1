package com.aichat.builder;

import com.aichat.entity.ChatMessage;
import com.aichat.entity.StickyFact;
import com.aichat.entity.UserProfile;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Builder for constructing AI prompts from user profiles, working memory,
 * short-term memory, and current messages.
 * 
 * Supports template-based prompt generation with variable substitution.
 */
public class PromptBuilder {

    private static final int DEFAULT_SHORT_TERM_MEMORY_LIMIT = 10;
    private static final Pattern VARIABLE_PATTERN = Pattern.compile("\\{([^}]+)\\}");

    // Section headers
    private static final String PROFILE_SECTION_HEADER = "=== ТВОЙ ПРОФИЛЬ ===";
    private static final String WORKING_MEMORY_SECTION_HEADER = "=== РАБОЧАЯ ПАМЯТЬ (контекст проекта) ===";
    private static final String SHORT_TERM_MEMORY_SECTION_HEADER = "=== КРАТКОСРОЧНАЯ ПАМЯТЬ (последние сообщения) ===";
    private static final String CURRENT_QUESTION_SECTION_HEADER = "=== ТЕКУЩИЙ ВОПРОС ===";

    /**
     * Builds the final prompt by combining all 4 sections:
     * 1. Profile section (from UserProfile)
     * 2. Working memory section (from StickyFacts)
     * 3. Short-term memory section (last N ChatMessages)
     * 4. Current user message
     *
     * @param profile User profile with prompt template, language, style
     * @param userMessage Current user message/question
     * @param stickyFacts List of sticky facts for working memory
     * @param recentHistory List of recent chat messages
     * @return Complete formatted prompt
     */
    public String buildFinalPrompt(
            UserProfile profile,
            String userMessage,
            List<StickyFact> stickyFacts,
            List<ChatMessage> recentHistory) {
        return buildFinalPrompt(profile, userMessage, stickyFacts, recentHistory, DEFAULT_SHORT_TERM_MEMORY_LIMIT);
    }

    /**
     * Builds the final prompt with configurable short-term memory limit.
     *
     * @param profile User profile with prompt template, language, style
     * @param userMessage Current user message/question
     * @param stickyFacts List of sticky facts for working memory
     * @param recentHistory List of recent chat messages
     * @param shortTermMemoryLimit Number of recent messages to include
     * @return Complete formatted prompt
     */
    public String buildFinalPrompt(
            UserProfile profile,
            String userMessage,
            List<StickyFact> stickyFacts,
            List<ChatMessage> recentHistory,
            int shortTermMemoryLimit) {
        
        StringBuilder prompt = new StringBuilder();
        
        // Section 1: Profile
        String profileSection = buildProfileSection(profile);
        if (!profileSection.isBlank()) {
            prompt.append(profileSection).append("\n\n");
        }
        
        // Section 2: Working Memory
        String workingMemorySection = buildWorkingMemorySection(stickyFacts);
        if (!workingMemorySection.isBlank()) {
            prompt.append(workingMemorySection).append("\n\n");
        }
        
        // Section 3: Short-term Memory
        String shortTermMemorySection = buildShortTermMemorySection(recentHistory, shortTermMemoryLimit);
        if (!shortTermMemorySection.isBlank()) {
            prompt.append(shortTermMemorySection).append("\n\n");
        }
        
        // Section 4: Current Question
        String currentQuestionSection = buildCurrentQuestionSection(userMessage);
        if (!currentQuestionSection.isBlank()) {
            prompt.append(currentQuestionSection);
        }
        
        return prompt.toString().trim();
    }

    /**
     * Applies template with variable substitution.
     * Supports variables in format: {variableName}
     *
     * @param template Template string with {variable} placeholders
     * @param variables Map of variable names to values
     * @return Template with all variables substituted
     */
    public String buildFromTemplate(String template, Map<String, String> variables) {
        if (template == null || template.isEmpty()) {
            return "";
        }
        
        if (variables == null || variables.isEmpty()) {
            return template;
        }
        
        String result = template;
        for (Map.Entry<String, String> entry : variables.entrySet()) {
            String variableName = entry.getKey();
            String variableValue = entry.getValue() != null ? entry.getValue() : "";
            result = result.replace("{" + variableName + "}", variableValue);
        }
        
        return result;
    }

    /**
     * Extracts variable names from a template.
     * Finds all {variableName} patterns in the template.
     *
     * @param template Template string with {variable} placeholders
     * @return List of unique variable names (without braces)
     */
    public List<String> extractVariables(String template) {
        if (template == null || template.isEmpty()) {
            return Collections.emptyList();
        }
        
        Matcher matcher = VARIABLE_PATTERN.matcher(template);
        Set<String> variables = new LinkedHashSet<>();
        
        while (matcher.find()) {
            variables.add(matcher.group(1));
        }
        
        return new ArrayList<>(variables);
    }

    /**
     * Builds the profile section from UserProfile.
     * Formats profileTemplate, language, and communicationStyle.
     *
     * @param profile User profile (can be null)
     * @return Formatted profile section string
     */
    public String buildProfileSection(UserProfile profile) {
        if (profile == null) {
            return "";
        }
        
        StringBuilder section = new StringBuilder();
        section.append(PROFILE_SECTION_HEADER).append("\n");
        
        // Add prompt template if present
        if (profile.getPromptTemplate() != null && !profile.getPromptTemplate().isBlank()) {
            section.append(profile.getPromptTemplate()).append("\n");
        }
        
        // Add language if present
        if (profile.getLanguage() != null && !profile.getLanguage().isBlank()) {
            section.append("Язык: ").append(profile.getLanguage()).append("\n");
        }
        
        // Add communication style if present
        if (profile.getCommunicationStyle() != null && !profile.getCommunicationStyle().isBlank()) {
            section.append("Стиль: ").append(profile.getCommunicationStyle()).append("\n");
        }
        
        return section.toString().trim();
    }

    /**
     * Builds the working memory section from sticky facts.
     * Includes all sticky facts (auto-extracted and manual).
     *
     * @param stickyFacts List of sticky facts (can be null/empty)
     * @return Formatted working memory section string
     */
    public String buildWorkingMemorySection(List<StickyFact> stickyFacts) {
        if (stickyFacts == null || stickyFacts.isEmpty()) {
            return "";
        }
        
        StringBuilder section = new StringBuilder();
        section.append(WORKING_MEMORY_SECTION_HEADER).append("\n");
        
        // Group facts by key for better organization
        Map<String, String> factMap = stickyFacts.stream()
            .collect(Collectors.toMap(
                StickyFact::getFactKey,
                StickyFact::getFactValue,
                (existing, replacement) -> replacement
            ));
        
        for (Map.Entry<String, String> entry : factMap.entrySet()) {
            section.append(entry.getKey()).append(": ").append(entry.getValue()).append("\n");
        }
        
        return section.toString().trim();
    }

    /**
     * Builds the short-term memory section from recent chat history.
     * Limited to last N messages (default: 10).
     *
     * @param recentHistory List of chat messages (can be null/empty)
     * @return Formatted short-term memory section string
     */
    public String buildShortTermMemorySection(List<ChatMessage> recentHistory) {
        return buildShortTermMemorySection(recentHistory, DEFAULT_SHORT_TERM_MEMORY_LIMIT);
    }

    /**
     * Builds the short-term memory section with configurable limit.
     *
     * @param recentHistory List of chat messages (can be null/empty)
     * @param limit Maximum number of recent messages to include
     * @return Formatted short-term memory section string
     */
    public String buildShortTermMemorySection(List<ChatMessage> recentHistory, int limit) {
        if (recentHistory == null || recentHistory.isEmpty()) {
            return "";
        }
        
        StringBuilder section = new StringBuilder();
        section.append(SHORT_TERM_MEMORY_SECTION_HEADER).append("\n");
        
        // Get last N messages
        List<ChatMessage> limitedHistory = recentHistory;
        if (recentHistory.size() > limit) {
            limitedHistory = recentHistory.subList(recentHistory.size() - limit, recentHistory.size());
        }
        
        for (ChatMessage message : limitedHistory) {
            String role = message.getRole() != null ? message.getRole().name() : "UNKNOWN";
            String content = message.getContent() != null ? message.getContent() : "";
            section.append("[").append(role).append("]: ").append(content).append("\n");
        }
        
        return section.toString().trim();
    }

    /**
     * Builds the current question section from user message.
     *
     * @param userMessage Current user message (can be null/empty)
     * @return Formatted current question section string
     */
    private String buildCurrentQuestionSection(String userMessage) {
        if (userMessage == null || userMessage.isBlank()) {
            return "";
        }
        
        StringBuilder section = new StringBuilder();
        section.append(CURRENT_QUESTION_SECTION_HEADER).append("\n");
        section.append(userMessage.trim());
        
        return section.toString();
    }
}
