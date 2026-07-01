package com.aichat.service.chunking;

import com.aichat.entity.DocumentChunk;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Service
public class SemanticChunkingStrategy implements ChunkingStrategy {
    
    private final int maxTokensPerSection;
    private final FixedSizeChunkingStrategy fallbackStrategy;
    
    /**
     * Default constructor with standard parameters.
     * Spring will inject FixedSizeChunkingStrategy automatically.
     */
    @Autowired
    public SemanticChunkingStrategy(FixedSizeChunkingStrategy fallbackStrategy) {
        this(1000, fallbackStrategy);
    }
    
    /**
     * Creates a semantic chunking strategy with specified parameters.
     * 
     * @param maxTokensPerSection Maximum tokens per section (default: 1000)
     * @param fallbackStrategy Fallback strategy when no headers found
     */
    public SemanticChunkingStrategy(int maxTokensPerSection, FixedSizeChunkingStrategy fallbackStrategy) {
        this.maxTokensPerSection = maxTokensPerSection;
        this.fallbackStrategy = fallbackStrategy;
    }
    
    @Override
    public List<DocumentChunk> chunk(String content, String source, String title) {
        List<DocumentChunk> chunks = new ArrayList<>();
        
        if (content == null || content.isEmpty()) {
            return chunks;
        }
        
        // Parse headers and split by sections
        List<Section> sections = parseSections(content);
        
        if (sections.isEmpty()) {
            // Fallback to fixed-size if no headers
            return fallbackStrategy.chunk(content, source, title);
        }
        
        int chunkIndex = 0;
        for (Section section : sections) {
            String[] words = section.content.split("\\s+");
            
            if (words.length <= maxTokensPerSection) {
                // Section fits in one chunk
                DocumentChunk chunk = createChunk(section, source, title, chunkIndex++, 0, words.length);
                chunks.add(chunk);
            } else {
                // Split large section into sub-chunks
                int subChunkIndex = 0;
                for (int i = 0; i < words.length; i += maxTokensPerSection) {
                    int end = Math.min(i + maxTokensPerSection, words.length);
                    String[] subWords = new String[end - i];
                    System.arraycopy(words, i, subWords, 0, subWords.length);
                    
                    DocumentChunk chunk = new DocumentChunk();
                    chunk.setSource(source);
                    chunk.setTitle(title);
                    chunk.setSection(section.header + "-" + subChunkIndex);
                    chunk.setChunkId(source + "-" + chunkIndex);
                    chunk.setChunkIndex(chunkIndex++);
                    chunk.setStartToken(i);
                    chunk.setEndToken(end);
                    chunk.setWordCount(subWords.length);
                    chunk.setContent(String.join(" ", subWords));
                    chunk.setCreatedAt(LocalDateTime.now());
                    
                    chunks.add(chunk);
                    subChunkIndex++;
                }
            }
        }
        
        return chunks;
    }
    
    /**
     * Parses content into sections based on Markdown headers (#, ##, ###).
     * 
     * @param content The markdown content to parse
     * @return List of sections with headers and content
     */
    private List<Section> parseSections(String content) {
        List<Section> sections = new ArrayList<>();
        String[] lines = content.split("\n");
        StringBuilder currentSection = new StringBuilder();
        String currentHeader = "";
        
        for (String line : lines) {
            if (line.startsWith("#")) {
                // Save previous section if exists
                if (!currentSection.isEmpty()) {
                    sections.add(new Section(currentHeader, currentSection.toString().trim()));
                }
                // Extract header text (remove all # characters and trim)
                currentHeader = line.replace("#", "").trim();
                currentSection = new StringBuilder();
            } else {
                currentSection.append(line).append(" ");
            }
        }
        
        // Add final section
        if (!currentSection.isEmpty()) {
            sections.add(new Section(currentHeader, currentSection.toString().trim()));
        }
        
        return sections;
    }
    
    /**
     * Creates a DocumentChunk from a section.
     * 
     * @param section The section to chunk
     * @param source The source identifier
     * @param title The document title
     * @param chunkIndex The chunk index
     * @param startToken Start token position
     * @param endToken End token position
     * @return DocumentChunk with all metadata set
     */
    private DocumentChunk createChunk(Section section, String source, String title, 
                                       int chunkIndex, int startToken, int endToken) {
        DocumentChunk chunk = new DocumentChunk();
        chunk.setSource(source);
        chunk.setTitle(title);
        chunk.setSection(section.header);
        chunk.setChunkId(source + "-" + chunkIndex);
        chunk.setChunkIndex(chunkIndex);
        chunk.setStartToken(startToken);
        chunk.setEndToken(endToken);
        chunk.setWordCount(section.content.split("\\s+").length);
        chunk.setContent(section.content);
        chunk.setCreatedAt(LocalDateTime.now());
        return chunk;
    }
    
    @Override
    public ChunkingType getType() {
        return ChunkingType.SEMANTIC;
    }
    
    public int getMaxTokensPerSection() {
        return maxTokensPerSection;
    }
    
    /**
     * Internal class representing a document section with header and content.
     */
    private static class Section {
        String header;
        String content;
        
        Section(String header, String content) {
            this.header = header;
            this.content = content;
        }
    }
}
