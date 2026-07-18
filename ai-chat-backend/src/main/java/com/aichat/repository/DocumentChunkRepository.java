package com.aichat.repository;

import com.aichat.entity.DocumentChunk;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface DocumentChunkRepository extends JpaRepository<DocumentChunk, Long> {
    List<DocumentChunk> findBySource(String source);
    List<DocumentChunk> findBySourceOrderByChunkIndex(String source);
    void deleteBySource(String source);
}
