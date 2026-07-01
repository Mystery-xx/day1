package com.aichat.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

/**
 * Exception thrown when file size exceeds the maximum allowed limit (10MB).
 */
@ResponseStatus(HttpStatus.PAYLOAD_TOO_LARGE)
public class FileTooLargeException extends RuntimeException {
    
    public FileTooLargeException(long fileSize) {
        super("File too large: " + (fileSize / 1024 / 1024) + "MB. Maximum allowed size is 10MB.");
    }
    
    public FileTooLargeException(long fileSize, Throwable cause) {
        super("File too large: " + (fileSize / 1024 / 1024) + "MB", cause);
    }
}
