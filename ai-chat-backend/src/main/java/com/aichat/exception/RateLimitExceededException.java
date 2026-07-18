package com.aichat.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

/**
 * Exception thrown when a client exceeds the configured rate limit.
 * Returns HTTP 429 Too Many Requests.
 */
@ResponseStatus(HttpStatus.TOO_MANY_REQUESTS)
public class RateLimitExceededException extends RuntimeException {
    
    /**
     * Constructs a new rate limit exceeded exception with the specified message.
     * @param message the detail message
     */
    public RateLimitExceededException(String message) {
        super(message);
    }
}
