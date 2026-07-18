package com.aichat.service.codereview;

import com.aichat.config.AiChatProperties;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * Style Guide agent - detects code style, naming, and convention violations.
 */
@Service
public class StyleGuideService extends AbstractCodeReviewAgent {

    public StyleGuideService(AiChatProperties properties) {
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
        return "style-guide";
    }

    @Override
    protected String getPromptPath() {
        return "prompts/style-guide.md";
    }

    @Override
    protected String getDefaultPrompt() {
        return """
You are a Style Guide AI agent. Analyze the diff for code style issues.
Focus on: naming conventions, formatting, dead code, magic numbers, duplicates.
Return a JSON array of findings with fields: file, line, severity, description, suggestion.
If no issues found, return empty array [].
""";
    }
}
