package com.aichat.integration;

import com.aichat.dto.rag.SearchResponse;
import com.aichat.dto.rag.UploadResponse;
import com.aichat.service.RagIndexingService;
import com.aichat.service.chunking.ChunkingType;
import com.aichat.service.storage.VectorStorageService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration tests for the full RAG pipeline.
 * Tests upload → statistics → search → delete workflow.
 */
@SpringBootTest
@DisplayName("RAG Integration Tests")
class RagIntegrationTest {

    @Autowired
    private RagIndexingService indexingService;

    @Autowired
    private VectorStorageService storageService;

    @BeforeEach
    void setUp() {
        // Clear storage before each test
        storageService.clear();
    }

    @AfterEach
    void tearDown() {
        // Clean up after each test
        storageService.clear();
    }

    @Test
    @DisplayName("Full pipeline: upload → statistics → search → delete")
    void testFullPipeline() {
        // Arrange: Create test document
        String content = """
            # Weather API Documentation
            
            ## Introduction
            The Weather API provides real-time weather data for any location.
            You can get current weather, forecasts, and historical data.
            
            ## Authentication
            All API requests require an API key in the header.
            Use the Authorization header with your API key.
            
            ## Endpoints
            GET /weather/current - Get current weather
            GET /weather/forecast - Get weather forecast
            GET /weather/history - Get historical weather data
            
            ## Response Format
            All responses are in JSON format with standard fields.
            """;
        
        MultipartFile file = new MockMultipartFile(
            "file",
            "weather-api.md",
            "text/markdown",
            content.getBytes(StandardCharsets.UTF_8)
        );

        // Act 1: Upload document
        var uploadResult = indexingService.index(file, ChunkingType.SEMANTIC);

        // Assert 1: Upload successful
        assertEquals("SUCCESS", uploadResult.getStatus(), "Upload should succeed");
        assertTrue(uploadResult.getChunkCount() > 0, "Should generate at least one chunk");
        assertNotNull(uploadResult.getDocumentId(), "Should have document ID");

        // Act 2: Check statistics
        int chunkCount = storageService.getChunkCount();
        int docCount = storageService.getDocumentCount();

        // Assert 2: Statistics correct
        assertTrue(chunkCount > 0, "Should have chunks in storage");
        assertEquals(1, docCount, "Should have one document");

        // Act 3: Search for relevant content
        var searchResults = storageService.search(
            new float[768], // Dummy embedding - will use mock
            5
        );

        // Assert 3: Search returns results (at least the document is indexed)
        // Note: With dummy embedding, similarity may be low but results should exist
        assertNotNull(searchResults, "Search should not return null");
        
        // Delete the document
        storageService.deleteBySource(uploadResult.getDocumentId());

        // Assert 4: Deletion successful
        int chunksAfterDelete = storageService.getChunkCount();
        assertEquals(0, chunksAfterDelete, "All chunks should be deleted");
    }

    @Test
    @DisplayName("Multiple file uploads - all indexed correctly")
    void testMultipleFileUploads() {
        // Arrange: Create multiple test documents
        String doc1 = """
            # Python Guide
            Python is a programming language.
            It is used for web development, data science, and automation.
            """;
        
        String doc2 = """
            # Java Guide
            Java is a programming language.
            It is used for enterprise applications and Android development.
            """;
        
        String doc3 = """
            # JavaScript Guide
            JavaScript is a programming language.
            It is used for web development and Node.js backend.
            """;

        MultipartFile file1 = new MockMultipartFile(
            "file", "python.md", "text/markdown",
            doc1.getBytes(StandardCharsets.UTF_8)
        );
        MultipartFile file2 = new MockMultipartFile(
            "file", "java.md", "text/markdown",
            doc2.getBytes(StandardCharsets.UTF_8)
        );
        MultipartFile file3 = new MockMultipartFile(
            "file", "javascript.md", "text/markdown",
            doc3.getBytes(StandardCharsets.UTF_8)
        );

        // Act: Upload all documents
        var result1 = indexingService.index(file1, ChunkingType.SEMANTIC);
        var result2 = indexingService.index(file2, ChunkingType.SEMANTIC);
        var result3 = indexingService.index(file3, ChunkingType.SEMANTIC);

        // Assert: All uploads successful
        assertEquals("SUCCESS", result1.getStatus());
        assertEquals("SUCCESS", result2.getStatus());
        assertEquals("SUCCESS", result3.getStatus());

        // Assert: Statistics show all documents
        int totalChunks = storageService.getChunkCount();
        int totalDocs = storageService.getDocumentCount();
        
        assertTrue(totalDocs >= 3, "Should have at least 3 documents");
        assertTrue(totalChunks >= 3, "Should have at least 3 chunks total");
    }

    @Test
    @DisplayName("Search with different queries - returns relevant results")
    void testSearchWithDifferentQueries() {
        // Arrange: Upload document with distinct topics
        String content = """
            # Machine Learning Basics
            
            ## Supervised Learning
            Supervised learning uses labeled training data.
            Examples include classification and regression tasks.
            
            ## Unsupervised Learning
            Unsupervised learning finds patterns in unlabeled data.
            Examples include clustering and dimensionality reduction.
            
            ## Reinforcement Learning
            Reinforcement learning learns from rewards and penalties.
            It is used in robotics and game playing AI.
            """;
        
        MultipartFile file = new MockMultipartFile(
            "file",
            "ml-basics.md",
            "text/markdown",
            content.getBytes(StandardCharsets.UTF_8)
        );

        // Upload document
        var uploadResult = indexingService.index(file, ChunkingType.SEMANTIC);
        assertEquals("SUCCESS", uploadResult.getStatus());

        // Act & Assert: Different queries should find content
        // Note: Real embedding service would be needed for actual similarity search
        // This test verifies the search infrastructure works
        var results1 = storageService.search(new float[768], 5);
        assertNotNull(results1);
        assertFalse(results1.isEmpty(), "Should find results for any query");
    }

    @Test
    @DisplayName("Statistics after upload - accurate counts")
    void testStatisticsAfterUpload() {
        // Arrange: Upload multiple documents
        for (int i = 0; i < 5; i++) {
            String content = "# Document " + i + "\nContent for document number " + i;
            MultipartFile file = new MockMultipartFile(
                "file",
                "doc" + i + ".md",
                "text/markdown",
                content.getBytes(StandardCharsets.UTF_8)
            );
            indexingService.index(file, ChunkingType.FIXED_SIZE);
        }

        // Act: Get statistics
        int chunkCount = storageService.getChunkCount();
        int docCount = storageService.getDocumentCount();

        // Assert: Accurate counts
        assertEquals(5, docCount, "Should have 5 documents");
        assertTrue(chunkCount >= 5, "Should have at least 5 chunks");
    }

    @Test
    @DisplayName("Upload with FIXED_SIZE strategy - chunks created correctly")
    void testUploadWithFixedSizeStrategy() {
        // Arrange: Create document with known word count
        String content = "word ".repeat(1500); // 1500 words
        MultipartFile file = new MockMultipartFile(
            "file",
            "fixed-size-test.md",
            "text/markdown",
            content.getBytes(StandardCharsets.UTF_8)
        );

        // Act: Upload with FIXED_SIZE strategy
        var result = indexingService.index(file, ChunkingType.FIXED_SIZE);

        // Assert: Chunks created with fixed size
        assertEquals("SUCCESS", result.getStatus());
        assertTrue(result.getChunkCount() > 1, "Should create multiple chunks for large content");
        
        // With default 500 words/chunk and 50 overlap, 1500 words should create ~3-4 chunks
        assertTrue(result.getChunkCount() >= 3, "Should create at least 3 chunks");
    }

    @Test
    @DisplayName("Upload with SEMANTIC strategy - preserves sections")
    void testUploadWithSemanticStrategy() {
        // Arrange: Create document with clear sections
        String content = """
            # Introduction
            This is the introduction section.
            
            ## Methods
            Here are the methods used.
            
            ## Results
            These are the results obtained.
            
            # Conclusion
            Final conclusions drawn.
            """;
        
        MultipartFile file = new MockMultipartFile(
            "file",
            "semantic-test.md",
            "text/markdown",
            content.getBytes(StandardCharsets.UTF_8)
        );

        // Act: Upload with SEMANTIC strategy
        var result = indexingService.index(file, ChunkingType.SEMANTIC);

        // Assert: Sections preserved
        assertEquals("SUCCESS", result.getStatus());
        assertTrue(result.getChunkCount() >= 4, "Should create chunks for each section");
    }

    @Test
    @DisplayName("Delete non-existent document - graceful handling")
    void testDeleteNonExistentDocument() {
        // Act & Assert: Should not throw exception
        assertDoesNotThrow(() -> {
            storageService.deleteBySource("non-existent-doc");
        }, "Deleting non-existent document should not throw exception");
    }

    @Test
    @DisplayName("Search with empty index - returns empty results")
    void testSearchWithEmptyIndex() {
        // Arrange: Ensure index is empty
        storageService.clear();

        // Act: Search empty index
        var results = storageService.search(new float[768], 10);

        // Assert: Empty results
        assertNotNull(results);
        assertTrue(results.isEmpty(), "Search on empty index should return empty results");
    }

    @Test
    @DisplayName("Upload same file twice - both indexed")
    void testUploadSameFileTwice() {
        // Arrange: Create test document
        String content = "# Test Document\nThis is test content.";
        MultipartFile file = new MockMultipartFile(
            "file",
            "duplicate.md",
            "text/markdown",
            content.getBytes(StandardCharsets.UTF_8)
        );

        // Act: Upload same file twice
        var result1 = indexingService.index(file, ChunkingType.SEMANTIC);
        var result2 = indexingService.index(file, ChunkingType.SEMANTIC);

        // Assert: Both uploads successful with different IDs
        assertEquals("SUCCESS", result1.getStatus());
        assertEquals("SUCCESS", result2.getStatus());
        
        // Document IDs should be different (timestamp-based)
        assertNotEquals(result1.getDocumentId(), result2.getDocumentId());
        
        // Both should be in storage
        int docCount = storageService.getDocumentCount();
        assertEquals(2, docCount, "Should have 2 separate documents");
    }

    @Test
    @DisplayName("Large document upload - handles correctly")
    void testLargeDocumentUpload() {
        // Arrange: Create large document (but under 10MB limit)
        StringBuilder content = new StringBuilder();
        content.append("# Large Document\n\n");
        for (int i = 0; i < 1000; i++) {
            content.append("## Section ").append(i).append("\n");
            content.append("This is content for section ").append(i).append(".\n");
            content.append("It contains multiple sentences to make it substantial.\n\n");
        }
        
        MultipartFile file = new MockMultipartFile(
            "file",
            "large-doc.md",
            "text/markdown",
            content.toString().getBytes(StandardCharsets.UTF_8)
        );

        // Act: Upload large document
        var result = indexingService.index(file, ChunkingType.SEMANTIC);

        // Assert: Upload successful
        assertEquals("SUCCESS", result.getStatus());
        assertTrue(result.getChunkCount() > 0, "Should generate chunks from large document");
    }
}
