package com.aichat.service.adapter;

import com.aichat.dto.ChatResponse;
import com.aichat.service.ollama.OllamaChatResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

/**
 * Adapter to convert OllamaChatResponse (native Ollama format) to internal ChatResponse (OpenAI-compatible format).
 * 
 * Ollama response format:
 * {
 *   "model": "llama3.2",
 *   "message": {
 *     "role": "assistant",
 *     "content": "Hello! How can I help you?"
 *   },
 *   "done": true,
 *   "total_duration": 123456789,
 *   "prompt_eval_count": 10,
 *   "eval_count": 50
 * }
 * 
 * Internal ChatResponse format (OpenAI-compatible):
 * {
 *   "content": "Hello! How can I help you?",
 *   "model": "llama3.2",
 *   "usage": {
 *     "prompt_tokens": 10,
 *     "completion_tokens": 50,
 *     "total_tokens": 60
 *   }
 * }
 */
@Component
public class OllamaResponseAdapter {
    
    private static final Logger logger = LoggerFactory.getLogger(OllamaResponseAdapter.class);
    
    /**
     * Convert OllamaChatResponse to internal ChatResponse.
     * 
     * @param ollamaResponse Native Ollama response
     * @return OpenAI-compatible ChatResponse
     */
    public ChatResponse adapt(OllamaChatResponse ollamaResponse) {
        if (ollamaResponse == null || ollamaResponse.getMessage() == null) {
            logger.warn("Null response or message from Ollama");
            return ChatResponse.error("Empty response from Ollama");
        }
        
        OllamaChatResponse.Message message = ollamaResponse.getMessage();
        String content = message.getContent();
        String model = ollamaResponse.getModel();
        
        // Build usage statistics from Ollama metrics
        Map<String, Object> usage = buildUsageStats(ollamaResponse);
        
        ChatResponse response = new ChatResponse(content, null, model, usage);
        logger.debug("Adapted Ollama response: model={}, contentLength={}, promptTokens={}, completionTokens={}", 
            model, content != null ? content.length() : 0, 
            usage.get("prompt_tokens"), usage.get("completion_tokens"));
        
        return response;
    }
    
    /**
     * Build usage statistics from Ollama response metrics.
     */
    private Map<String, Object> buildUsageStats(OllamaChatResponse ollamaResponse) {
        Map<String, Object> usage = new HashMap<>();
        
        // Ollama provides prompt_eval_count (input tokens) and eval_count (output tokens)
        if (ollamaResponse.getPrompt_eval_count() != null) {
            usage.put("prompt_tokens", ollamaResponse.getPrompt_eval_count().intValue());
        }
        
        if (ollamaResponse.getEval_count() != null) {
            usage.put("completion_tokens", ollamaResponse.getEval_count().intValue());
        }
        
        // Calculate total tokens
        Integer promptTokens = ollamaResponse.getPrompt_eval_count() != null ? 
            ollamaResponse.getPrompt_eval_count().intValue() : 0;
        Integer completionTokens = ollamaResponse.getEval_count() != null ? 
            ollamaResponse.getEval_count().intValue() : 0;
        usage.put("total_tokens", promptTokens + completionTokens);
        
        return usage;
    }
}
