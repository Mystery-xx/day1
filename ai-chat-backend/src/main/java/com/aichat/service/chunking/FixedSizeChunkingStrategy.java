package com.aichat.service.chunking;

import com.aichat.entity.DocumentChunk;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Service
public class FixedSizeChunkingStrategy implements ChunkingStrategy {
    
    private final int chunkSize;
    private final int overlap;
    
    /**
     * Creates a fixed-size chunking strategy with specified parameters.
     * 
     * @param chunkSize Number of tokens per chunk (default: 500)
     * @param overlap Number of overlapping tokens between chunks (default: 50)
     */
    public FixedSizeChunkingStrategy(int chunkSize, int overlap) {
        this.chunkSize = chunkSize;
        this.overlap = overlap;
    }
    
    /**
     * Default constructor with standard parameters.
     */
    public FixedSizeChunkingStrategy() {
        this(500, 50);
    }
    
    @Override
    public List<DocumentChunk> chunk(String content, String source, String title) {
        List<DocumentChunk> chunks = new ArrayList<>();
        
        if (content == null || content.isEmpty()) {
            return chunks;
        }
        
        // Tokenize content into words
        String[] words = content.split("\\s+");
        
        int chunkIndex = 0;
        int startIndex = 0;
        
        while (startIndex < words.length) {
            int endIndex = Math.min(startIndex + chunkSize, words.length);
            
            // Extract chunk words
            String[] chunkWords = new String[endIndex - startIndex];
            System.arraycopy(words, startIndex, chunkWords, 0, chunkWords.length);
            String chunkText = String.join(" ", chunkWords);
            
            // Create document chunk with all metadata
            DocumentChunk chunk = new DocumentChunk();
            chunk.setSource(source);
            chunk.setTitle(title);
            chunk.setChunkId(source + "-" + chunkIndex);
            chunk.setChunkIndex(chunkIndex);
            chunk.setStartToken(startIndex);
            chunk.setEndToken(endIndex);
            chunk.setWordCount(chunkWords.length);
            chunk.setContent(chunkText);
            chunk.setCreatedAt(LocalDateTime.now());
            
            chunks.add(chunk);
            chunkIndex++;
            
            // Move start index with overlap (ensure forward progress and no negative index)
            int nextStartIndex = endIndex - overlap;
            if (nextStartIndex <= startIndex) {
                // Overlap is too large, advance by at least 1 to prevent infinite loop
                startIndex = endIndex;
            } else {
                startIndex = nextStartIndex;
            }
            
            // Prevent infinite loop at end of content
            if (startIndex >= words.length) {
                break;
            }
        }
        
        return chunks;
    }
    
    @Override
    public ChunkingType getType() {
        return ChunkingType.FIXED_SIZE;
    }
    
    public int getChunkSize() {
        return chunkSize;
    }
    
    public int getOverlap() {
        return overlap;
    }
}
