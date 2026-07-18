package com.aichat.service.chunking;

import com.aichat.entity.DocumentChunk;
import java.util.List;

public interface ChunkingStrategy {
    List<DocumentChunk> chunk(String content, String source, String title);
    ChunkingType getType();
}
