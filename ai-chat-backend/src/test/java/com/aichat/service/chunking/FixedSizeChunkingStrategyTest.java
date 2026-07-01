package com.aichat.service.chunking;

import com.aichat.entity.DocumentChunk;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Comprehensive unit tests for FixedSizeChunkingStrategy.
 * Covers edge cases, boundary conditions, and bug fix verification.
 */
@DisplayName("FixedSizeChunkingStrategy Unit Tests")
class FixedSizeChunkingStrategyTest {

    private FixedSizeChunkingStrategy strategy;

    @BeforeEach
    void setUp() {
        // Use default constructor with standard parameters (500 tokens, 50 overlap)
        strategy = new FixedSizeChunkingStrategy();
    }

    @Test
    @DisplayName("Normal case: chunkSize=100, overlap=20 - produces overlapping chunks")
    void testNormalCaseWithOverlap() {
        // Arrange
        FixedSizeChunkingStrategy customStrategy = new FixedSizeChunkingStrategy(100, 20);
        String content = "word ".repeat(350); // 350 words

        // Act
        List<DocumentChunk> chunks = customStrategy.chunk(content, "test.md", "Test Document");

        // Assert
        assertNotNull(chunks);
        assertFalse(chunks.isEmpty());
        
        // Should produce multiple chunks with overlap
        assertTrue(chunks.size() >= 3, "Should produce at least 3 chunks");
        
        // Verify chunk structure
        for (int i = 0; i < chunks.size(); i++) {
            DocumentChunk chunk = chunks.get(i);
            assertNotNull(chunk.getChunkId(), "Chunk ID should not be null");
            assertNotNull(chunk.getContent(), "Chunk content should not be null");
            assertEquals("test.md", chunk.getSource(), "Source should match");
            assertEquals("Test Document", chunk.getTitle(), "Title should match");
            assertEquals(i, chunk.getChunkIndex(), "Chunk index should be sequential");
            assertTrue(chunk.getWordCount() <= 100, "Chunk should not exceed chunkSize");
            assertNotNull(chunk.getCreatedAt(), "Created timestamp should be set");
        }
    }

    @Test
    @DisplayName("Edge case: empty content - returns empty list")
    void testEmptyContent() {
        // Arrange
        String emptyContent = "";

        // Act
        List<DocumentChunk> chunks = strategy.chunk(emptyContent, "test.md", "Test");

        // Assert
        assertNotNull(chunks);
        assertTrue(chunks.isEmpty(), "Empty content should produce no chunks");
    }

    @Test
    @DisplayName("Edge case: null content - returns empty list")
    void testNullContent() {
        // Act
        List<DocumentChunk> chunks = strategy.chunk(null, "test.md", "Test");

        // Assert
        assertNotNull(chunks);
        assertTrue(chunks.isEmpty(), "Null content should produce no chunks");
    }

    @Test
    @DisplayName("Edge case: content smaller than chunkSize - single chunk")
    void testContentSmallerThanChunkSize() {
        // Arrange
        String smallContent = "This is a small content with only twenty words in total here now today yes";

        // Act
        List<DocumentChunk> chunks = strategy.chunk(smallContent, "small.md", "Small Test");

        // Assert
        assertNotNull(chunks);
        assertEquals(1, chunks.size(), "Small content should produce exactly one chunk");
        
        DocumentChunk chunk = chunks.get(0);
        assertEquals("small.md", chunk.getSource());
        assertEquals("Small Test", chunk.getTitle());
        assertEquals(0, chunk.getChunkIndex());
        assertEquals(0, chunk.getStartToken());
        assertNotNull(chunk.getContent());
    }

    @Test
    @DisplayName("Edge case: content exactly chunkSize - may produce 1-2 chunks due to overlap")
    void testContentExactlyChunkSize() {
        // Arrange
        FixedSizeChunkingStrategy exactStrategy = new FixedSizeChunkingStrategy(50, 10);
        String exactContent = "word ".repeat(50).trim(); // Exactly 50 words

        // Act
        List<DocumentChunk> chunks = exactStrategy.chunk(exactContent, "exact.md", "Exact Test");

        // Assert: With overlap, may create 2 chunks (first 50 words, then overlap tries for more)
        assertNotNull(chunks);
        assertTrue(chunks.size() >= 1 && chunks.size() <= 2, 
            "Content matching chunkSize should produce 1-2 chunks");
        
        DocumentChunk chunk = chunks.get(0);
        assertTrue(chunk.getWordCount() <= 50, "First chunk should not exceed chunkSize");
        assertEquals(0, chunk.getStartToken());
    }

    @Test
    @DisplayName("Edge case: overlap = 0 (no overlap) - contiguous chunks")
    void testZeroOverlap() {
        // Arrange
        FixedSizeChunkingStrategy noOverlapStrategy = new FixedSizeChunkingStrategy(50, 0);
        String content = "word ".repeat(150); // 150 words

        // Act
        List<DocumentChunk> chunks = noOverlapStrategy.chunk(content, "nooverlap.md", "No Overlap Test");

        // Assert
        assertNotNull(chunks);
        assertEquals(3, chunks.size(), "Should produce exactly 3 chunks with no overlap");
        
        // Verify contiguous chunks (end of chunk i = start of chunk i+1)
        for (int i = 0; i < chunks.size() - 1; i++) {
            DocumentChunk current = chunks.get(i);
            DocumentChunk next = chunks.get(i + 1);
            assertEquals(current.getEndToken(), next.getStartToken(), 
                "Chunks should be contiguous with zero overlap");
        }
    }

    @Test
    @DisplayName("Bug fix verification: overlap >= chunkSize - no ArrayIndexOutOfBoundsException")
    void testOverlapGreaterThanChunkSize() {
        // Arrange
        // This used to cause infinite loop or ArrayIndexOutOfBoundsException
        FixedSizeChunkingStrategy badStrategy = new FixedSizeChunkingStrategy(50, 60); // overlap > chunkSize
        String content = "word ".repeat(200); // 200 words

        // Act & Assert: Should NOT throw exception
        assertDoesNotThrow(() -> {
            List<DocumentChunk> chunks = badStrategy.chunk(content, "bugtest.md", "Bug Test");
            
            // Verify chunks are produced correctly
            assertNotNull(chunks);
            assertFalse(chunks.isEmpty());
            
            // Each chunk should advance forward (no infinite loop)
            for (int i = 0; i < chunks.size(); i++) {
                DocumentChunk chunk = chunks.get(i);
                assertNotNull(chunk);
                assertTrue(chunk.getWordCount() <= 50, "Chunk should not exceed chunkSize");
            }
        }, "Should handle overlap >= chunkSize without throwing exception");
    }

    @Test
    @DisplayName("Edge case: overlap equals chunkSize - no infinite loop")
    void testOverlapEqualsChunkSize() {
        // Arrange
        FixedSizeChunkingStrategy edgeStrategy = new FixedSizeChunkingStrategy(30, 30); // overlap == chunkSize
        String content = "word ".repeat(100);

        // Act & Assert
        assertDoesNotThrow(() -> {
            List<DocumentChunk> chunks = edgeStrategy.chunk(content, "edge.md", "Edge Test");
            
            assertNotNull(chunks);
            assertFalse(chunks.isEmpty());
            
            // Should handle gracefully by advancing at least 1 token
            int prevEndToken = 0;
            for (DocumentChunk chunk : chunks) {
                assertTrue(chunk.getStartToken() >= prevEndToken - 30, 
                    "Should not go backwards more than overlap");
                prevEndToken = chunk.getEndToken();
            }
        }, "Should handle overlap == chunkSize without infinite loop");
    }

    @Test
    @DisplayName("Boundary case: single word content")
    void testSingleWordContent() {
        // Arrange
        String singleWord = "hello";

        // Act
        List<DocumentChunk> chunks = strategy.chunk(singleWord, "single.md", "Single Word Test");

        // Assert
        assertNotNull(chunks);
        assertEquals(1, chunks.size(), "Single word should produce one chunk");
        
        DocumentChunk chunk = chunks.get(0);
        assertEquals(1, chunk.getWordCount());
        assertEquals("hello", chunk.getContent());
    }

    @Test
    @DisplayName("Chunk metadata verification: all fields populated correctly")
    void testChunkMetadataFields() {
        // Arrange
        FixedSizeChunkingStrategy metaStrategy = new FixedSizeChunkingStrategy(100, 20);
        String content = "word ".repeat(250);

        // Act
        List<DocumentChunk> chunks = metaStrategy.chunk(content, "meta.md", "Metadata Test");

        // Assert
        assertNotNull(chunks);
        assertTrue(chunks.size() >= 2);
        
        DocumentChunk firstChunk = chunks.get(0);
        // ID is null before persistence (expected behavior)
        assertEquals("meta.md", firstChunk.getSource());
        assertEquals("Metadata Test", firstChunk.getTitle());
        assertEquals("meta.md-0", firstChunk.getChunkId());
        assertEquals(0, firstChunk.getChunkIndex());
        assertEquals(0, firstChunk.getStartToken());
        assertTrue(firstChunk.getEndToken() > 0);
        assertTrue(firstChunk.getWordCount() > 0);
        assertNotNull(firstChunk.getContent());
        assertNotNull(firstChunk.getCreatedAt());
        assertNull(firstChunk.getEmbedding(), "Embedding should be null until generated");
    }

    @Test
    @DisplayName("Overlap verification: consecutive chunks share overlapping tokens")
    void testOverlapBetweenConsecutiveChunks() {
        // Arrange
        FixedSizeChunkingStrategy overlapStrategy = new FixedSizeChunkingStrategy(100, 25);
        String content = "word ".repeat(250);

        // Act
        List<DocumentChunk> chunks = overlapStrategy.chunk(content, "overlap.md", "Overlap Test");

        // Assert
        assertNotNull(chunks);
        assertTrue(chunks.size() >= 2);
        
        // Verify overlap between consecutive chunks
        for (int i = 0; i < chunks.size() - 1; i++) {
            DocumentChunk current = chunks.get(i);
            DocumentChunk next = chunks.get(i + 1);
            
            // Next chunk should start before current chunk ends (overlap)
            assertTrue(next.getStartToken() < current.getEndToken(), 
                "Consecutive chunks should overlap");
            
            // Overlap should be approximately 25 tokens
            int actualOverlap = current.getEndToken() - next.getStartToken();
            assertTrue(actualOverlap <= 25, "Overlap should not exceed configured overlap");
            assertTrue(actualOverlap >= 0, "Overlap should be non-negative");
        }
    }
}
