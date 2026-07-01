package com.aichat.service.ollama;

/**
 * Exception thrown when the requested embedding model is not found.
 */
public class ModelNotFoundException extends RuntimeException {
    
    public ModelNotFoundException(String modelName) {
        super("Model not found: " + modelName);
    }
    
    public ModelNotFoundException(String modelName, Throwable cause) {
        super("Model not found: " + modelName, cause);
    }
}
