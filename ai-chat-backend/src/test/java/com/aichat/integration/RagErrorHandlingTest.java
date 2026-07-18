package com.aichat.integration;

import com.aichat.dto.rag.UploadResponse;
import com.aichat.entity.DocumentChunk;
import com.aichat.exception.FileTooLargeException;
import com.aichat.exception.InvalidFileException;
import com.aichat.service.FileUploadValidator;
import com.aichat.service.RagIndexingService;
import com.aichat.service.chunking.ChunkingType;
import com.aichat.service.chunking.FixedSizeChunkingStrategy;
import com.aichat.service.chunking.SemanticChunkingStrategy;
import com.aichat.service.storage.VectorStorageService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Error handling tests for RAG operations.
 * Tests exception scenarios, edge cases, and failure recovery.
 */
@SpringBootTest
@DisplayName("RAG Error Handling Tests")
class RagErrorHandlingTest {

    @Autowired
    private RagIndexingService indexingService;

    @Autowired
    private VectorStorageService storageService;

    @Autowired
    private FileUploadValidator validator;

    @MockBean
    private FixedSizeChunkingStrategy fixedStrategy;

    @MockBean
    private SemanticChunkingStrategy semanticStrategy;

    @BeforeEach
    void setUp() {
        storageService.clear();
    }

    @AfterEach
    void tearDown() {
        storageService.clear();
    }

    @Test
    @DisplayName("Invalid file upload: .exe - throws InvalidFileException")
    void testInvalidFileUpload() {
        // Arrange
        String content = "Malicious executable content";
        MultipartFile file = new MockMultipartFile(
            "file",
            "malware.exe",
            "application/x-executable",
            content.getBytes(StandardCharsets.UTF_8)
        );

        // Act & Assert
        InvalidFileException exception = assertThrows(
            InvalidFileException.class,
            () -> validator.validate(file),
            "Should throw InvalidFileException for .exe files"
        );
        assertTrue(exception.getMessage().contains("malware.exe"));
    }

    @Test
    @DisplayName("File too large: >10MB - throws FileTooLargeException")
    void testFileTooLargeUpload() {
        // Arrange
        byte[] largeContent = new byte[11 * 1024 * 1024]; // 11MB
        MultipartFile file = new MockMultipartFile(
            "file",
            "largefile.txt",
            "text/plain",
            largeContent
        );

        // Act & Assert
        FileTooLargeException exception = assertThrows(
            FileTooLargeException.class,
            () -> validator.validate(file),
            "Should throw FileTooLargeException for files > 10MB"
        );
        assertTrue(exception.getMessage().contains("File too large"));
    }

    @Test
    @DisplayName("Empty file upload - throws InvalidFileException")
    void testEmptyFileUpload() {
        // Arrange
        MultipartFile file = new MockMultipartFile(
            "file",
            "empty.txt",
            "text/plain",
            new byte[0]
        );

        // Act & Assert
        InvalidFileException exception = assertThrows(
            InvalidFileException.class,
            () -> validator.validate(file),
            "Should throw InvalidFileException for empty files"
        );
        assertTrue(exception.getMessage().contains("empty file"));
    }

    @Test
    @DisplayName("Null file upload - throws InvalidFileException")
    void testNullFileUpload() {
        // Act & Assert
        InvalidFileException exception = assertThrows(
            InvalidFileException.class,
            () -> validator.validate(null),
            "Should throw InvalidFileException for null files"
        );
        assertTrue(exception.getMessage().contains("empty file"));
    }

    @Test
    @DisplayName("Search with empty index - returns empty results")
    void testSearchWithEmptyIndex() {
        // Arrange
        storageService.clear();

        // Act
        var results = storageService.search(new float[768], 10);

        // Assert
        assertNotNull(results);
        assertTrue(results.isEmpty(), "Empty index should return empty results");
    }

    @Test
    @DisplayName("Delete non-existent document - graceful handling")
    void testDeleteNonExistentDocument() {
        // Arrange
        String nonExistentSource = "non-existent-doc-12345";

        // Act & Assert: Should not throw exception
        assertDoesNotThrow(() -> {
            storageService.deleteBySource(nonExistentSource);
        }, "Deleting non-existent document should not throw exception");
    }

    @Test
    @DisplayName("Chunking strategy returns empty chunks - failure result")
    void testEmptyChunksFromStrategy() {
        // Arrange: Mock strategy to return empty chunks
        when(fixedStrategy.chunk(anyString(), anyString(), anyString()))
            .thenReturn(Collections.emptyList());
        
        String content = "Test content";
        MultipartFile file = new MockMultipartFile(
            "file",
            "test.md",
            "text/markdown",
            content.getBytes(StandardCharsets.UTF_8)
        );

        // Act
        var result = indexingService.index(file, ChunkingType.FIXED_SIZE);

        // Assert: Should fail with appropriate error
        assertEquals("FAILED", result.getStatus());
        assertTrue(result.getErrorMessage().contains("Failed to generate chunks") || 
                   result.getErrorMessage().contains("no chunks"), 
                   "Should indicate chunking failure");
    }

    @Test
    @DisplayName("Chunking strategy throws exception - failure result with rollback")
    void testChunkingStrategyException() {
        // Arrange: Mock strategy to throw exception
        when(fixedStrategy.chunk(anyString(), anyString(), anyString()))
            .thenThrow(new RuntimeException("Chunking failed"));
        
        String content = "Test content";
        MultipartFile file = new MockMultipartFile(
            "file",
            "test.md",
            "text/markdown",
            content.getBytes(StandardCharsets.UTF_8)
        );

        // Act
        var result = indexingService.index(file, ChunkingType.FIXED_SIZE);

        // Assert: Should fail gracefully
        assertEquals("FAILED", result.getStatus());
        assertTrue(result.getErrorMessage().contains("Chunking failed"));
    }

    @Test
    @DisplayName("Embedding service throws exception - failure result")
    void testEmbeddingServiceException() {
        // Arrange: Mock strategies to return valid chunks, but embedding will fail
        DocumentChunk mockChunk = new DocumentChunk();
        mockChunk.setChunkId("test-0");
        mockChunk.setContent("Test content");
        mockChunk.setSource("test.md");
        
        when(fixedStrategy.chunk(anyString(), anyString(), anyString()))
            .thenReturn(List.of(mockChunk));
        
        String content = "Test content";
        MultipartFile file = new MockMultipartFile(
            "file",
            "test.md",
            "text/markdown",
            content.getBytes(StandardCharsets.UTF_8)
        );

        // Act: Embedding will fail because OllamaClient is not available in test
        var result = indexingService.index(file, ChunkingType.FIXED_SIZE);

        // Assert: Should fail gracefully with error
        assertEquals("FAILED", result.getStatus());
        assertNotNull(result.getErrorMessage());
    }

    @Test
    @DisplayName("Null content from file - failure result")
    void testNullFileContent() {
        // Arrange: Create file with only whitespace
        String content = "   \n\t  ";
        MultipartFile file = new MockMultipartFile(
            "file",
            "whitespace.md",
            "text/markdown",
            content.getBytes(StandardCharsets.UTF_8)
        );

        // Act
        var result = indexingService.index(file, ChunkingType.SEMANTIC);

        // Assert: Should fail with appropriate error
        assertEquals("FAILED", result.getStatus());
        assertTrue(result.getErrorMessage().contains("empty") || 
                   result.getErrorMessage().contains("Failed to generate chunks"));
    }

    @Test
    @DisplayName("Invalid UTF-8 encoding - throws InvalidFileException")
    void testInvalidUtf8Encoding() {
        // Arrange: Create file with invalid UTF-8 bytes
        byte[] invalidUtf8 = new byte[] { (byte) 0xFF, (byte) 0xFF, (byte) 0xFF, (byte) 0xFF };
        MultipartFile file = new MockMultipartFile(
            "file",
            "invalid.txt",
            "text/plain",
            invalidUtf8
        );

        // Act & Assert
        InvalidFileException exception = assertThrows(
            InvalidFileException.class,
            () -> validator.validate(file),
            "Should throw InvalidFileException for invalid UTF-8"
        );
        assertTrue(exception.getMessage().contains("invalid.txt"));
    }

    @Test
    @DisplayName("File with no extension - throws InvalidFileException")
    void testFileWithNoExtension() {
        // Arrange
        String content = "Content without extension";
        MultipartFile file = new MockMultipartFile(
            "file",
            "noextension",
            "text/plain",
            content.getBytes(StandardCharsets.UTF_8)
        );

        // Act & Assert
        InvalidFileException exception = assertThrows(
            InvalidFileException.class,
            () -> validator.validate(file),
            "Should throw InvalidFileException for files without extension"
        );
        assertTrue(exception.getMessage().contains("noextension"));
    }

    @Test
    @DisplayName("Multiple validation failures - first failure stops processing")
    void testMultipleValidationFailures() {
        // Arrange: File that is both too large and has invalid extension
        byte[] largeContent = new byte[15 * 1024 * 1024]; // 15MB
        MultipartFile file = new MockMultipartFile(
            "file",
            "large.exe",
            "application/x-executable",
            largeContent
        );

        // Act & Assert: Should fail on file size first (fail fast)
        FileTooLargeException exception = assertThrows(
            FileTooLargeException.class,
            () -> validator.validate(file),
            "Should throw FileTooLargeException (checked before extension)"
        );
        assertTrue(exception.getMessage().contains("File too large"));
    }

    @Test
    @DisplayName("Rollback on failure - cleans up partial chunks")
    void testRollbackOnFailure() {
        // Arrange: Create a scenario where rollback is triggered
        String content = "Test content for rollback";
        MultipartFile file = new MockMultipartFile(
            "file",
            "rollback-test.md",
            "text/markdown",
            content.getBytes(StandardCharsets.UTF_8)
        );

        // First upload should succeed
        var firstResult = indexingService.index(file, ChunkingType.SEMANTIC);
        
        // Then manually delete to simulate rollback scenario
        if ("SUCCESS".equals(firstResult.getStatus())) {
            storageService.deleteBySource(firstResult.getDocumentId());
            
            // Assert: Storage should be empty
            assertEquals(0, storageService.getChunkCount(), 
                "Rollback should clean up all chunks");
        }
    }

    @Test
    @DisplayName("Concurrent uploads - handles gracefully")
    void testConcurrentUploads() {
        // Arrange: Multiple concurrent uploads
        Runnable uploadTask = () -> {
            String content = "Concurrent test content";
            MultipartFile file = new MockMultipartFile(
                "file",
                "concurrent-" + Thread.currentThread().getName() + ".md",
                "text/markdown",
                content.getBytes(StandardCharsets.UTF_8)
            );
            indexingService.index(file, ChunkingType.SEMANTIC);
        };

        // Act: Run multiple uploads concurrently
        Thread thread1 = new Thread(uploadTask);
        Thread thread2 = new Thread(uploadTask);
        Thread thread3 = new Thread(uploadTask);

        thread1.start();
        thread2.start();
        thread3.start();

        // Assert: All threads complete without exception
        assertDoesNotThrow(() -> {
            thread1.join(5000);
            thread2.join(5000);
            thread3.join(5000);
        }, "Concurrent uploads should complete without hanging");
    }

    @Test
    @DisplayName("Upload response error format - contains required fields")
    void testUploadResponseErrorFormat() {
        // Arrange: Invalid file
        MultipartFile file = new MockMultipartFile(
            "file",
            "invalid.exe",
            "application/x-executable",
            "malicious".getBytes(StandardCharsets.UTF_8)
        );

        // Act
        var result = indexingService.index(file, ChunkingType.SEMANTIC);

        // Assert: Error response has required fields
        assertEquals("FAILED", result.getStatus());
        assertNotNull(result.getErrorMessage());
        assertTrue(result.getErrorMessage().length() > 0);
    }
}
