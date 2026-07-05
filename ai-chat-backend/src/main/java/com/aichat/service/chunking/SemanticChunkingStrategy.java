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
        this(1500, fallbackStrategy);  // Increased from 1000 to 1500 for better semantic coherence
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
        
        System.out.println("[SEMANTIC-DEBUG] Starting semantic chunking for: " + source);
        System.out.println("[SEMANTIC-DEBUG] Content length: " + content.length() + " chars");
        
        // Parse headers and split by sections
        List<Section> sections = parseSections(content);
        
        System.out.println("[SEMANTIC-DEBUG] Parsed " + sections.size() + " sections");
        for (Section s : sections) {
            System.out.println("[SEMANTIC-DEBUG]   Section: '" + s.header + "' - " + s.content.split("\\s+").length + " tokens");
        }
        
        if (sections.isEmpty()) {
            System.out.println("[SEMANTIC-DEBUG] No sections found, falling back to fixed-size strategy");
            // Fallback to fixed-size if no headers
            return fallbackStrategy.chunk(content, source, title);
        }
        
        int chunkIndex = 0;
        for (Section section : sections) {
            String[] words = section.content.split("\\s+");
            
            // Skip empty sections - they should be merged with previous section
            if (words.length == 0 || (words.length == 1 && words[0].isEmpty())) {
                System.out.println("[SEMANTIC-DEBUG] Skipping empty section: '" + section.header + "'");
                continue;
            }
            
            if (words.length <= maxTokensPerSection * 1.5) {
                // Section fits in one chunk (with some tolerance)
                DocumentChunk chunk = createChunk(section, source, title, chunkIndex++, 0, words.length);
                chunks.add(chunk);
            } else {
                // Section still too large - use fallback strategy
                List<DocumentChunk> fallbackChunks = fallbackStrategy.chunk(section.content, source, title);
                for (DocumentChunk fallbackChunk : fallbackChunks) {
                    fallbackChunk.setSection(section.header);
                    fallbackChunk.setChunkIndex(chunkIndex++);
                    chunks.add(fallbackChunk);
                }
            }
        }
        
        return chunks;
    }
    
    /**
     * Parses content into sections based on Markdown headers (#, ##, ###).
     * Recursively splits large sections by sub-headers.
     * 
     * @param content The markdown content to parse
     * @return List of sections with headers and content
     */
    private List<Section> parseSections(String content) {
        return parseSectionsRecursive(content, 0);
    }
    
    /**
     * Recursively parses sections, splitting large ones by sub-headers.
     * Supports both Markdown headers (#) and plain text ALL CAPS headers.
     * 
     * @param content The content to parse
     * @param headerLevel Current header level (0=none, 1=#, 2=##, etc.)
     * @return List of sections
     */
    private List<Section> parseSectionsRecursive(String content, int headerLevel) {
        List<Section> sections = new ArrayList<>();
        String[] lines = content.split("\n");
        StringBuilder currentSection = new StringBuilder();
        String currentHeader = "";
        int currentLevel = headerLevel;
        
        for (String line : lines) {
            int lineLevel = getHeaderLevel(line);
            boolean isPlainTextHeader = (lineLevel == 0) && isPlainTextHeader(line);
            
            if (lineLevel > 0 && lineLevel > headerLevel) {
                // Markdown header found
                if (!currentSection.isEmpty()) {
                    String sectionContent = currentSection.toString().trim();
                    if (sectionContent.split("\\s+").length > maxTokensPerSection * 1.5) {
                        sections.addAll(parseSectionsRecursive(sectionContent, lineLevel));
                    } else {
                        sections.add(new Section(currentHeader, sectionContent));
                    }
                }
                currentHeader = line.substring(lineLevel).trim();
                currentLevel = lineLevel;
                currentSection = new StringBuilder();
            } else if (isPlainTextHeader && headerLevel == 0) {
                // Plain text header (ALL CAPS) found in non-Markdown document
                if (!currentSection.isEmpty()) {
                    String sectionContent = currentSection.toString().trim();
                    if (sectionContent.split("\\s+").length > maxTokensPerSection * 1.5) {
                        sections.addAll(parseSectionsRecursive(sectionContent, 1));
                    } else {
                        sections.add(new Section(currentHeader, sectionContent));
                    }
                }
                currentHeader = line.trim();
                currentLevel = 1;
                currentSection = new StringBuilder();
            } else if (lineLevel > 0 && lineLevel <= headerLevel) {
                currentSection.append(line).append(" ");
            } else {
                currentSection.append(line).append(" ");
            }
        }
        
        // Add final section
        if (!currentSection.isEmpty()) {
            String sectionContent = currentSection.toString().trim();
            if (sectionContent.split("\\s+").length > maxTokensPerSection * 1.5 && headerLevel < 6) {
                sections.addAll(parseSectionsRecursive(sectionContent, headerLevel + 1));
            } else {
                sections.add(new Section(currentHeader, sectionContent));
            }
        }
        
        return sections;
    }
    
    /**
     * Gets the header level (1-6) for a line, or 0 if not a header.
     * Supports both "# Header" and "#Header" formats (with or without space).
     * Works with any Unicode characters including Cyrillic.
     */
    private int getHeaderLevel(String line) {
        if (line == null || line.isEmpty()) return 0;
        
        // Trim leading whitespace
        String trimmed = line.trim();
        if (trimmed.isEmpty()) return 0;
        
        // Must start with #
        if (trimmed.charAt(0) != '#') return 0;
        
        // Count consecutive '#' at start
        int level = 0;
        int i = 0;
        while (i < trimmed.length() && trimmed.charAt(i) == '#') {
            level++;
            i++;
        }
        
        // Valid levels: 1-6
        if (level < 1 || level > 6) return 0;
        
        // After #'s: must have space + text, or just text (no space)
        // Examples: "# Header", "#Header", "# Заголовок", "#Заголовок"
        if (i >= trimmed.length()) {
            // Just "###" with no text - not a valid header
            return 0;
        }
        
        // Check what follows the #'s
        char nextChar = trimmed.charAt(i);
        if (nextChar == ' ') {
            // "# Header" - must have text after space
            return (i + 1 < trimmed.length()) ? level : 0;
        } else {
            // "#Header" - any non-space char is valid start of header text
            return level;
        }
    }
    
    /**
     * Detects plain text headers in non-Markdown documents.
     * Identifies ALL CAPS lines (Cyrillic or Latin) as potential headers.
     * 
     * Heuristics for plain text headers:
     * - Line is mostly or entirely uppercase letters
     * - Line is relatively short (< 100 chars)
     * - Line contains no ending punctuation (no . ! ?)
     * - Line contains at least one letter
     * 
     * Examples that match:
     * - "ЗОЛОТОЙ КЛЮЧИК, или ПРИКЛЮЧЕНИЯ БУРАТИНО"
     * - "ГЛАВА 1. НАЧАЛО ПРИКЛЮЧЕНИЙ"
     * - "CHAPTER ONE: THE BEGINNING"
     * 
     * Examples that don't match:
     * - "Это обычный текст с заглавными буквами."
     * - "ОЧЕНЬ ДЛИННАЯ СТРОКА КОТОРАЯ ЯВЛЯЕТСЯ ОБЫЧНЫМ ТЕКСТОМ А НЕ ЗАГОЛОВКОМ..."
     */
    private boolean isPlainTextHeader(String line) {
        if (line == null || line.isEmpty()) return false;
        
        String trimmed = line.trim();
        if (trimmed.isEmpty()) return false;
        
        // Skip very long lines (likely body text)
        if (trimmed.length() > 100) return false;
        
        // Skip lines with sentence-ending punctuation
        if (trimmed.matches(".*[.!?]$")) return false;
        
        // Count uppercase vs total letters (supports Cyrillic and Latin)
        int letterCount = 0;
        int upperCount = 0;
        
        for (char c : trimmed.toCharArray()) {
            if (Character.isLetter(c)) {
                letterCount++;
                if (Character.isUpperCase(c)) {
                    upperCount++;
                }
            }
        }
        
        // Must have at least 3 letters
        if (letterCount < 3) return false;
        
        // At least 70% of letters must be uppercase
        double upperRatio = (double) upperCount / letterCount;
        return upperRatio >= 0.7;
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
