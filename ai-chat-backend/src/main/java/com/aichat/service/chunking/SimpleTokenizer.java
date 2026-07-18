package com.aichat.service.chunking;

import org.springframework.stereotype.Service;

/**
 * Simple word-based tokenizer for text chunking.
 * Splits text on whitespace boundaries.
 */
@Service
public class SimpleTokenizer {
    
    /**
     * Tokenizes text into words by splitting on whitespace.
     * 
     * @param text The text to tokenize
     * @return Array of word tokens
     */
    public String[] tokenize(String text) {
        if (text == null || text.isEmpty()) {
            return new String[0];
        }
        
        return text.split("\\s+");
    }
    
    /**
     * Counts the number of tokens in the text.
     * 
     * @param text The text to count tokens for
     * @return Number of tokens (words)
     */
    public int countTokens(String text) {
        if (text == null || text.isEmpty()) {
            return 0;
        }
        
        return tokenize(text).length;
    }
    
    /**
     * Extracts a subset of tokens from the text.
     * 
     * @param text The source text
     * @param startToken Starting token index (inclusive)
     * @param endToken Ending token index (exclusive)
     * @return Extracted text containing the specified token range
     */
    public String extractTokens(String text, int startToken, int endToken) {
        if (text == null || text.isEmpty()) {
            return "";
        }
        
        String[] tokens = tokenize(text);
        
        if (startToken < 0) {
            startToken = 0;
        }
        
        if (endToken > tokens.length) {
            endToken = tokens.length;
        }
        
        if (startToken >= endToken) {
            return "";
        }
        
        String[] extracted = new String[endToken - startToken];
        System.arraycopy(tokens, startToken, extracted, 0, extracted.length);
        
        return String.join(" ", extracted);
    }
}
