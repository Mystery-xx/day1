package com.aichat.service.codereview;

import com.aichat.config.AiChatProperties;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * Bug Hunter agent - detects potential bugs, logic errors, and runtime issues.
 */
@Service
public class BugHunterService extends AbstractCodeReviewAgent {

    public BugHunterService(AiChatProperties properties) {
        super(properties, 120); // 2 minute timeout
    }

    @Override
    public ReviewResult review(DiffContext context) {
        long startTime = System.currentTimeMillis();
        String prompt = loadPrompt();
        List<Map<String, Object>> rawFindings = callAiApi(prompt, context);
        return buildResult(rawFindings, startTime);
    }

    @Override
    public String agentName() {
        return "bug-hunter";
    }

    @Override
    protected String getPromptPath() {
        return "prompts/bug-hunter.md";
    }

    @Override
    protected String getDefaultPrompt() {
        return """
You are a Bug Hunter AI agent. Analyze the provided diff and identify bugs.
Focus on: null pointer risks, logic errors, resource leaks, concurrency issues.
Return a JSON array of findings with fields: file, line, severity, description, suggestion.
Severity: CRITICAL, HIGH, MEDIUM, LOW, INFO.
If no bugs found, return empty array [].
""";
    }
}
