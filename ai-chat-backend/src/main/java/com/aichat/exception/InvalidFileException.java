package com.aichat.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

/**
 * Exception thrown when file extension is not allowed.
 * Only .txt and .md files are accepted.
 */
@ResponseStatus(HttpStatus.BAD_REQUEST)
public class InvalidFileException extends RuntimeException {
    
    public InvalidFileException(String filename) {
        super("Invalid file extension: " + filename + ". Only .txt and .md files are allowed.");
    }
    
    public InvalidFileException(String filename, Throwable cause) {
        super("Invalid file extension: " + filename, cause);
    }
}
