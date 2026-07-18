package com.aichat.service.codereview;

import com.aichat.config.AiChatProperties;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * Security Checker agent - detects security vulnerabilities in code changes.
 */
@Service
public class SecurityCheckerService extends AbstractCodeReviewAgent {

    public SecurityCheckerService(AiChatProperties properties) {
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
        return "security-checker";
    }

    @Override
    protected String getPromptPath() {
        return "prompts/security-checker.md";
    }

    @Override
    protected String getDefaultPrompt() {
        return """
You are a Security Checker AI agent. Analyze the diff for security vulnerabilities.
Focus on: SQL injection, XSS, hardcoded secrets, auth bypasses, input validation.
Return a JSON array of findings with fields: file, line, severity, description, suggestion.
If no issues found, return empty array [].
""";
    }
}
