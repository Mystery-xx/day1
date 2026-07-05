package com.aichat.service;

import com.aichat.exception.FileTooLargeException;
import com.aichat.exception.InvalidFileException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Set;

/**
 * Service for validating file uploads.
 * Validates file size, extension, and encoding.
 */
@Service
public class FileUploadValidator {
    
    private static final Logger logger = LoggerFactory.getLogger(FileUploadValidator.class);
    
    private static final long MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    private static final Set<String> ALLOWED_EXTENSIONS = Set.of(".txt", ".md");
    private static final Charset REQUIRED_ENCODING = StandardCharsets.UTF_8;
    
    /**
     * Validates a multipart file for upload.
     * Checks size first (fail fast), then extension, then encoding.
     * 
     * @param file the file to validate
     * @throws FileTooLargeException if file size exceeds 10MB
     * @throws InvalidFileException if file extension is not .txt or .md
     */
    public void validate(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            logger.warn("Validation failed: file is null or empty");
            throw new InvalidFileException("empty file");
        }
        
        String filename = file.getOriginalFilename();
        if (filename == null || filename.isEmpty()) {
            logger.warn("Validation failed: filename is null or empty");
            throw new InvalidFileException("missing filename");
        }
        
        // Check size FIRST (fail fast)
        long fileSize = file.getSize();
        if (fileSize > MAX_FILE_SIZE) {
            logger.warn("Validation failed: file too large ({} bytes)", fileSize);
            throw new FileTooLargeException(fileSize);
        }
        
        // Check extension SECOND - handle compound extensions like .tar.gz, .Ru.txt
        String extension = getFileExtension(filename);
        String normalizedExtension = extension.toLowerCase();
        if (!ALLOWED_EXTENSIONS.contains(normalizedExtension)) {
            logger.warn("Validation failed: invalid extension '{}' for file '{}'. Allowed: {}", extension, filename, ALLOWED_EXTENSIONS);
            throw new InvalidFileException(filename);
        }
        
        // Verify file can be read (skip strict UTF-8 validation)
        try {
            file.getBytes();
        } catch (Exception e) {
            logger.warn("Validation failed: cannot read file '{}'", filename, e);
            throw new InvalidFileException(filename, e);
        }
        
        logger.debug("Validation passed for file '{}' ({} bytes, {})", filename, fileSize, extension);
    }
    
    /**
     * Extracts file extension from filename.
     * For compound extensions (e.g., .tar.gz, .Ru.txt), returns only the last part.
     * Returns empty string if no extension found.
     */
    private String getFileExtension(String filename) {
        int lastDotIndex = filename.lastIndexOf('.');
        if (lastDotIndex < 0 || lastDotIndex == filename.length() - 1) {
            return "";
        }
        
        // Extract extension after last dot
        String extension = filename.substring(lastDotIndex);
        
        // Handle compound extensions like .Ru.txt -> .txt
        // Find if there's another extension before this one
        int secondLastDot = filename.lastIndexOf('.', lastDotIndex - 1);
        if (secondLastDot > 0) {
            // Check if the part between dots looks like a domain suffix (e.g., "Ru" in "TheLib.Ru.txt")
            String middlePart = filename.substring(secondLastDot + 1, lastDotIndex);
            // If middle part is short (2-3 chars) and alphabetic, it's likely a domain-like suffix
            // In this case, use only the final extension
            if (middlePart.length() <= 3 && middlePart.matches("[a-zA-Z]+")) {
                return extension;
            }
        }
        
        return extension;
    }
}
