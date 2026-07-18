package com.aichat.service;

import com.aichat.exception.FileTooLargeException;
import com.aichat.exception.InvalidFileException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Comprehensive unit tests for FileUploadValidator.
 * Tests file size, extension, encoding, and edge cases.
 */
@DisplayName("FileUploadValidator Unit Tests")
class FileUploadValidatorTest {

    private FileUploadValidator validator;

    @BeforeEach
    void setUp() {
        validator = new FileUploadValidator();
    }

    @Test
    @DisplayName("Valid file: test.md - passes validation")
    void testValidMarkdownFile() {
        // Arrange
        String content = "# Test Document\nThis is valid markdown content.";
        MultipartFile file = new MockMultipartFile(
            "file",
            "test.md",
            "text/markdown",
            content.getBytes(StandardCharsets.UTF_8)
        );

        // Act & Assert
        assertDoesNotThrow(() -> validator.validate(file), 
            "Valid .md file should pass validation");
    }

    @Test
    @DisplayName("Valid file: test.txt - passes validation")
    void testValidTextFile() {
        // Arrange
        String content = "This is valid plain text content.";
        MultipartFile file = new MockMultipartFile(
            "file",
            "test.txt",
            "text/plain",
            content.getBytes(StandardCharsets.UTF_8)
        );

        // Act & Assert
        assertDoesNotThrow(() -> validator.validate(file), 
            "Valid .txt file should pass validation");
    }

    @Test
    @DisplayName("Invalid extension: .exe - throws InvalidFileException")
    void testInvalidExeExtension() {
        // Arrange
        String content = "Executable content";
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
    @DisplayName("Invalid extension: .bat - throws InvalidFileException")
    void testInvalidBatExtension() {
        // Arrange
        String content = "Batch file content";
        MultipartFile file = new MockMultipartFile(
            "file",
            "script.bat",
            "application/x-bat",
            content.getBytes(StandardCharsets.UTF_8)
        );

        // Act & Assert
        InvalidFileException exception = assertThrows(
            InvalidFileException.class,
            () -> validator.validate(file),
            "Should throw InvalidFileException for .bat files"
        );
        assertTrue(exception.getMessage().contains("script.bat"));
    }

    @Test
    @DisplayName("Invalid extension: .pdf - throws InvalidFileException")
    void testInvalidPdfExtension() {
        // Arrange
        String content = "PDF content";
        MultipartFile file = new MockMultipartFile(
            "file",
            "document.pdf",
            "application/pdf",
            content.getBytes(StandardCharsets.UTF_8)
        );

        // Act & Assert
        InvalidFileException exception = assertThrows(
            InvalidFileException.class,
            () -> validator.validate(file),
            "Should throw InvalidFileException for .pdf files"
        );
        assertTrue(exception.getMessage().contains("document.pdf"));
    }

    @Test
    @DisplayName("File too large: >10MB - throws FileTooLargeException")
    void testFileTooLarge() {
        // Arrange
        // Create a file larger than 10MB (10 * 1024 * 1024 = 10485760 bytes)
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
        assertTrue(exception.getMessage().contains("10MB"));
    }

    @Test
    @DisplayName("File at exact limit: 10MB - passes validation")
    void testFileAtExactLimit() {
        // Arrange
        // Create a file exactly at 10MB limit
        byte[] content = new byte[10 * 1024 * 1024]; // Exactly 10MB
        MultipartFile file = new MockMultipartFile(
            "file",
            "limitfile.txt",
            "text/plain",
            content
        );

        // Act & Assert
        assertDoesNotThrow(() -> validator.validate(file), 
            "File at exactly 10MB should pass validation");
    }

    @Test
    @DisplayName("Null file - throws InvalidFileException")
    void testNullFile() {
        // Act & Assert
        InvalidFileException exception = assertThrows(
            InvalidFileException.class,
            () -> validator.validate(null),
            "Should throw InvalidFileException for null file"
        );
        assertTrue(exception.getMessage().contains("empty file"));
    }

    @Test
    @DisplayName("Empty file - throws InvalidFileException")
    void testEmptyFile() {
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
            "Should throw InvalidFileException for empty file"
        );
        assertTrue(exception.getMessage().contains("empty file"));
    }

    @Test
    @DisplayName("File with no extension - throws InvalidFileException")
    void testNoExtension() {
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
    @DisplayName("Case insensitive extension: .TXT - passes validation")
    void testCaseInsensitiveExtension() {
        // Arrange
        String content = "Uppercase extension content";
        MultipartFile file = new MockMultipartFile(
            "file",
            "test.TXT",
            "text/plain",
            content.getBytes(StandardCharsets.UTF_8)
        );

        // Act & Assert
        assertDoesNotThrow(() -> validator.validate(file), 
            "Extension should be case-insensitive");
    }

    @Test
    @DisplayName("Case insensitive extension: .Md - passes validation")
    void testMixedCaseExtension() {
        // Arrange
        String content = "Mixed case extension content";
        MultipartFile file = new MockMultipartFile(
            "file",
            "test.Md",
            "text/markdown",
            content.getBytes(StandardCharsets.UTF_8)
        );

        // Act & Assert
        assertDoesNotThrow(() -> validator.validate(file), 
            "Extension should be case-insensitive");
    }

    @Test
    @DisplayName("Invalid extension: .jar - throws InvalidFileException")
    void testInvalidJarExtension() {
        // Arrange
        String content = "Jar file content";
        MultipartFile file = new MockMultipartFile(
            "file",
            "archive.jar",
            "application/java-archive",
            content.getBytes(StandardCharsets.UTF_8)
        );

        // Act & Assert
        InvalidFileException exception = assertThrows(
            InvalidFileException.class,
            () -> validator.validate(file),
            "Should throw InvalidFileException for .jar files"
        );
        assertTrue(exception.getMessage().contains("archive.jar"));
    }

    @Test
    @DisplayName("UTF-8 encoded file - passes validation")
    void testValidUtf8Encoding() {
        // Arrange
        String content = "UTF-8 content with special chars: café, naïve, 日本語";
        MultipartFile file = new MockMultipartFile(
            "file",
            "unicode.txt",
            "text/plain",
            content.getBytes(StandardCharsets.UTF_8)
        );

        // Act & Assert
        assertDoesNotThrow(() -> validator.validate(file), 
            "Valid UTF-8 encoded file should pass validation");
    }

    @Test
    @DisplayName("File with just dot in name - throws InvalidFileException")
    void testJustDotFilename() {
        // Arrange
        String content = "Hidden file content";
        MultipartFile file = new MockMultipartFile(
            "file",
            ".hidden",
            "text/plain",
            content.getBytes(StandardCharsets.UTF_8)
        );

        // Act & Assert
        InvalidFileException exception = assertThrows(
            InvalidFileException.class,
            () -> validator.validate(file),
            "Should throw InvalidFileException for hidden files without proper extension"
        );
        assertTrue(exception.getMessage().contains(".hidden"));
    }
}
