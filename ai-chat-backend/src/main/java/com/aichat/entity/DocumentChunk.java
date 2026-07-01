package com.aichat.entity;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.LocalDateTime;

@Entity
@Table(name = "document_chunks", indexes = {
    @Index(name = "idx_source", columnList = "source"),
    @Index(name = "idx_chunk_id", columnList = "chunkId")
})
public class DocumentChunk implements Serializable {
    
    private static final long serialVersionUID = 1L;
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(length = 500)
    private String source;          // файл/URL источника
    
    @Column(length = 500)
    private String title;           // заголовок документа
    
    @Column(length = 500)
    private String section;         // секция/раздел
    
    @Column(name = "chunk_id", length = 255)
    private String chunkId;         // уникальный ID чанка
    
    @Column(name = "chunk_index")
    private Integer chunkIndex;     // порядковый номер (0, 1, 2...)
    
    @Column(name = "start_token")
    private Integer startToken;     // позиция начала в документе
    
    @Column(name = "end_token")
    private Integer endToken;       // позиция конца в документе
    
    @Column(name = "word_count")
    private Integer wordCount;      // размер чанка в словах
    
    @Column(length = 2000)
    private float[] embedding;      // 768-dim вектор
    
    @Lob
    private String content;         // текст чанка
    
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
    
    public DocumentChunk() {
    }
    
    // Getters and Setters
    
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public String getSource() {
        return source;
    }
    
    public void setSource(String source) {
        this.source = source;
    }
    
    public String getTitle() {
        return title;
    }
    
    public void setTitle(String title) {
        this.title = title;
    }
    
    public String getSection() {
        return section;
    }
    
    public void setSection(String section) {
        this.section = section;
    }
    
    public String getChunkId() {
        return chunkId;
    }
    
    public void setChunkId(String chunkId) {
        this.chunkId = chunkId;
    }
    
    public Integer getChunkIndex() {
        return chunkIndex;
    }
    
    public void setChunkIndex(Integer chunkIndex) {
        this.chunkIndex = chunkIndex;
    }
    
    public Integer getStartToken() {
        return startToken;
    }
    
    public void setStartToken(Integer startToken) {
        this.startToken = startToken;
    }
    
    public Integer getEndToken() {
        return endToken;
    }
    
    public void setEndToken(Integer endToken) {
        this.endToken = endToken;
    }
    
    public Integer getWordCount() {
        return wordCount;
    }
    
    public void setWordCount(Integer wordCount) {
        this.wordCount = wordCount;
    }
    
    public float[] getEmbedding() {
        return embedding;
    }
    
    public void setEmbedding(float[] embedding) {
        this.embedding = embedding;
    }
    
    public String getContent() {
        return content;
    }
    
    public void setContent(String content) {
        this.content = content;
    }
    
    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
    
    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
