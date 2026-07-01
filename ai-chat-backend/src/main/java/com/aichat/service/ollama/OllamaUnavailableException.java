package com.aichat.service.ollama;

/**
 * Exception thrown when Ollama service is unavailable or connection fails.
 */
public class OllamaUnavailableException extends RuntimeException {
    
    public OllamaUnavailableException(String message) {
        super(message);
    }
    
    public OllamaUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
