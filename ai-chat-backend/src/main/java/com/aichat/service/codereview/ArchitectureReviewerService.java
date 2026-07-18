package com.aichat.service.codereview;

import com.aichat.config.AiChatProperties;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * Architecture Reviewer agent - detects layered violations, coupling, SOLID issues.
 */
@Service
public class ArchitectureReviewerService extends AbstractCodeReviewAgent {

    public ArchitectureReviewerService(AiChatProperties properties) {
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
        return "architecture-reviewer";
    }

    @Override
    protected String getPromptPath() {
        return "prompts/architecture-reviewer.md";
    }

    @Override
    protected String getDefaultPrompt() {
        return """
You are an Architecture Reviewer AI agent. Analyze the diff for architectural issues.
Focus on: SOLID violations, layered coupling, missing abstractions, circular dependencies.
Return a JSON array of findings with fields: file, line, severity, description, suggestion.
If no issues found, return empty array [].
""";
    }
}
