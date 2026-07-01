package com.aichat.service.chunking;

import com.aichat.entity.DocumentChunk;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Comprehensive unit tests for SemanticChunkingStrategy.
 * Tests semantic boundary detection, fallback behavior, and edge cases.
 */
@DisplayName("SemanticChunkingStrategy Unit Tests")
class SemanticChunkingStrategyTest {

    private FixedSizeChunkingStrategy fallbackStrategy;
    private SemanticChunkingStrategy semanticStrategy;

    @BeforeEach
    void setUp() {
        fallbackStrategy = new FixedSizeChunkingStrategy(500, 50);
        semanticStrategy = new SemanticChunkingStrategy(1000, fallbackStrategy);
    }

    @Test
    @DisplayName("Normal case: multi-paragraph text with headers - splits by sections")
    void testMultiParagraphWithHeaders() {
        // Arrange
        String markdownContent = """
            # Introduction
            This is the introduction section of our document.
            It contains important information about the project.
            
            ## Background
            The background section provides context.
            We need to understand the history first.
            
            ## Implementation
            Here we describe how to implement the solution.
            Multiple paragraphs with detailed steps.
            
            ### Step 1
            First step is to set up the environment.
            
            ### Step 2
            Second step is to write the code.
            
            # Conclusion
            In conclusion, this document was helpful.
            """;

        // Act
        List<DocumentChunk> chunks = semanticStrategy.chunk(markdownContent, "doc.md", "Test Document");

        // Assert
        assertNotNull(chunks);
        assertFalse(chunks.isEmpty());
        
        // Should split by headers (at least 5 sections: Introduction, Background, Implementation, Step 1, Step 2, Conclusion)
        assertTrue(chunks.size() >= 5, "Should split into multiple sections by headers");
        
        // Verify sections are preserved
        boolean hasIntroduction = chunks.stream()
            .anyMatch(c -> c.getSection() != null && c.getSection().contains("Introduction"));
        boolean hasBackground = chunks.stream()
            .anyMatch(c -> c.getSection() != null && c.getSection().contains("Background"));
        boolean hasImplementation = chunks.stream()
            .anyMatch(c -> c.getSection() != null && c.getSection().contains("Implementation"));
        
        assertTrue(hasIntroduction, "Should have Introduction section");
        assertTrue(hasBackground, "Should have Background section");
        assertTrue(hasImplementation, "Should have Implementation section");
    }

    @Test
    @DisplayName("Fallback case: no headers - uses FixedSizeChunkingStrategy")
    void testNoHeadersFallback() {
        // Arrange
        String plainText = """
            This is plain text without any markdown headers.
            It should fall back to fixed-size chunking.
            The content is long enough to require multiple chunks.
            """ .repeat(50); // Repeat to ensure multiple chunks

        // Act
        List<DocumentChunk> chunks = semanticStrategy.chunk(plainText, "plain.txt", "Plain Text");

        // Assert
        assertNotNull(chunks);
        assertFalse(chunks.isEmpty());
        
        // Verify fallback behavior (should use fixed-size chunking)
        // Chunks may have section set to chunkId suffix (implementation detail)
        for (DocumentChunk chunk : chunks) {
            assertNotNull(chunk.getContent());
        }
    }

    @Test
    @DisplayName("Edge case: empty content - returns empty list")
    void testEmptyContent() {
        // Arrange
        String emptyContent = "";

        // Act
        List<DocumentChunk> chunks = semanticStrategy.chunk(emptyContent, "empty.md", "Empty");

        // Assert
        assertNotNull(chunks);
        assertTrue(chunks.isEmpty(), "Empty content should produce no chunks");
    }

    @Test
    @DisplayName("Edge case: null content - returns empty list")
    void testNullContent() {
        // Act
        List<DocumentChunk> chunks = semanticStrategy.chunk(null, "null.md", "Null");

        // Assert
        assertNotNull(chunks);
        assertTrue(chunks.isEmpty(), "Null content should produce no chunks");
    }

    @Test
    @DisplayName("Edge case: single sentence - single chunk")
    void testSingleSentence() {
        // Arrange
        String singleSentence = "This is a single sentence without any headers.";

        // Act
        List<DocumentChunk> chunks = semanticStrategy.chunk(singleSentence, "single.md", "Single");

        // Assert
        assertNotNull(chunks);
        assertEquals(1, chunks.size(), "Single sentence should produce one chunk");
        
        DocumentChunk chunk = chunks.get(0);
        assertNotNull(chunk.getContent());
        assertTrue(chunk.getContent().contains("single sentence"));
    }

    @Test
    @DisplayName("Section size limit: large section splits into sub-chunks")
    void testLargeSectionSplits() {
        // Arrange
        SemanticChunkingStrategy smallLimitStrategy = new SemanticChunkingStrategy(50, fallbackStrategy);
        
        String largeSection = """
            # Large Section
            """ + "word ".repeat(200); // 200 words in one section

        // Act
        List<DocumentChunk> chunks = smallLimitStrategy.chunk(largeSection, "large.md", "Large Section Test");

        // Assert
        assertNotNull(chunks);
        assertTrue(chunks.size() >= 2, "Large section should split into multiple sub-chunks");
        
        // Verify each sub-chunk respects the limit
        for (DocumentChunk chunk : chunks) {
            assertTrue(chunk.getWordCount() <= 50, 
                "Each sub-chunk should not exceed maxTokensPerSection");
            assertNotNull(chunk.getSection());
            assertTrue(chunk.getSection().contains("Large Section"));
        }
    }

    @Test
    @DisplayName("Mixed headers: H1, H2, H3 all detected correctly")
    void testMixedHeaderLevels() {
        // Arrange
        String mixedHeaders = """
            # Main Title (H1)
            Content under main title.
            
            ## Section 2.1 (H2)
            Content under H2.
            
            ### Subsection 2.1.1 (H3)
            Content under H3.
            
            ## Section 2.2 (H2)
            More content under H2.
            
            # Another Main Title (H1)
            Final content.
            """;

        // Act
        List<DocumentChunk> chunks = semanticStrategy.chunk(mixedHeaders, "mixed.md", "Mixed Headers");

        // Assert
        assertNotNull(chunks);
        assertTrue(chunks.size() >= 5, "Should detect all header levels");
        
        // Verify different header levels are captured
        List<String> sections = chunks.stream()
            .map(DocumentChunk::getSection)
            .filter(s -> s != null)
            .distinct()
            .toList();
        
        assertTrue(sections.stream().anyMatch(s -> s.contains("Main Title")), "Should have H1 sections");
        assertTrue(sections.stream().anyMatch(s -> s.contains("Section 2.1")), "Should have H2 sections");
        assertTrue(sections.stream().anyMatch(s -> s.contains("Subsection 2.1.1")), "Should have H3 sections");
    }

    @Test
    @DisplayName("Metadata verification: all fields populated for semantic chunks")
    void testSemanticChunkMetadata() {
        // Arrange
        String content = """
            # Test Section
            This is test content for metadata verification.
            It should contain enough words to be meaningful.
            """;

        // Act
        List<DocumentChunk> chunks = semanticStrategy.chunk(content, "meta.md", "Metadata Test");

        // Assert
        assertNotNull(chunks);
        assertFalse(chunks.isEmpty());
        
        DocumentChunk chunk = chunks.get(0);
        assertEquals("meta.md", chunk.getSource());
        assertEquals("Metadata Test", chunk.getTitle());
        assertEquals("Test Section", chunk.getSection());
        assertNotNull(chunk.getChunkId());
        assertTrue(chunk.getChunkId().startsWith("meta.md"));
        assertEquals(0, chunk.getChunkIndex());
        assertNotNull(chunk.getContent());
        assertNotNull(chunk.getCreatedAt());
    }

    @Test
    @DisplayName("Whitespace handling: headers with extra spaces")
    void testHeadersWithExtraWhitespace() {
        // Arrange
        String messyHeaders = """
            #   Header with spaces   
            Content here.
            
            ##  Another Header  
            More content.
            """;

        // Act
        List<DocumentChunk> chunks = semanticStrategy.chunk(messyHeaders, "messy.md", "Messy Headers");

        // Assert
        assertNotNull(chunks);
        assertTrue(chunks.size() >= 2);
        
        // Verify headers are cleaned (extra # and spaces removed)
        for (DocumentChunk chunk : chunks) {
            if (chunk.getSection() != null) {
                assertFalse(chunk.getSection().startsWith("#"), "Header should not contain # characters");
                assertFalse(chunk.getSection().startsWith(" "), "Header should be trimmed");
                assertFalse(chunk.getSection().endsWith(" "), "Header should be trimmed");
            }
        }
    }

    @Test
    @DisplayName("Chunking type verification: returns SEMANTIC type")
    void testChunkingType() {
        // Act
        ChunkingType type = semanticStrategy.getType();

        // Assert
        assertEquals(ChunkingType.SEMANTIC, type, "Should return SEMANTIC chunking type");
    }

    @Test
    @DisplayName("Max tokens per section getter")
    void testMaxTokensPerSectionGetter() {
        // Arrange
        SemanticChunkingStrategy customStrategy = new SemanticChunkingStrategy(750, fallbackStrategy);

        // Act
        int maxTokens = customStrategy.getMaxTokensPerSection();

        // Assert
        assertEquals(750, maxTokens, "Should return configured maxTokensPerSection");
    }
}
