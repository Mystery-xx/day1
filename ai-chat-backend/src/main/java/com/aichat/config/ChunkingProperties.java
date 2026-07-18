package com.aichat.config;

import com.aichat.service.chunking.ChunkingType;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "rag.chunking")
public class ChunkingProperties {
    private int fixedSize = 500;     // токенов
    private int overlap = 50;         // токенов overlap
    private int semanticMax = 1000;   // токенов на секцию
    private ChunkingType strategy = ChunkingType.SEMANTIC;

    public int getFixedSize() {
        return fixedSize;
    }

    public void setFixedSize(int fixedSize) {
        this.fixedSize = fixedSize;
    }

    public int getOverlap() {
        return overlap;
    }

    public void setOverlap(int overlap) {
        this.overlap = overlap;
    }

    public int getSemanticMax() {
        return semanticMax;
    }

    public void setSemanticMax(int semanticMax) {
        this.semanticMax = semanticMax;
    }

    public ChunkingType getStrategy() {
        return strategy;
    }

    public void setStrategy(ChunkingType strategy) {
        this.strategy = strategy;
    }
}
