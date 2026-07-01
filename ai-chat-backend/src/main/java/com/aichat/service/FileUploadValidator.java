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
        
        // Check extension SECOND
        String extension = getFileExtension(filename);
        if (!ALLOWED_EXTENSIONS.contains(extension.toLowerCase())) {
            logger.warn("Validation failed: invalid extension '{}' for file '{}'", extension, filename);
            throw new InvalidFileException(filename);
        }
        
        // Check encoding (UTF-8)
        try {
            byte[] content = file.getBytes();
            String contentStr = new String(content, REQUIRED_ENCODING);
            // Verify it's valid UTF-8 by checking if re-encoding produces same bytes
            byte[] reencoded = contentStr.getBytes(REQUIRED_ENCODING);
            if (content.length != reencoded.length) {
                logger.warn("Validation failed: invalid UTF-8 encoding for file '{}'", filename);
                throw new InvalidFileException(filename);
            }
        } catch (Exception e) {
            logger.warn("Validation failed: cannot read file '{}' as UTF-8", filename, e);
            throw new InvalidFileException(filename, e);
        }
        
        logger.debug("Validation passed for file '{}' ({} bytes, {})", filename, fileSize, extension);
    }
    
    /**
     * Extracts file extension from filename.
     * Returns empty string if no extension found.
     */
    private String getFileExtension(String filename) {
        int lastDotIndex = filename.lastIndexOf('.');
        if (lastDotIndex < 0 || lastDotIndex == filename.length() - 1) {
            return "";
        }
        return filename.substring(lastDotIndex);
    }
}
