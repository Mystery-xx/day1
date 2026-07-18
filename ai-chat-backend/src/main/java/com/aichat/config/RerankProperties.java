package com.aichat.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "rag.rerank")
public class RerankProperties {
    private boolean enabled = false;
    private String baseUrl = "${TEI_RERANKER_URL:http://tei-reranker:80}";
    private int topKBefore = 20;
    private int topKAfter = 5;
    private double threshold = 0.7;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public int getTopKBefore() {
        return topKBefore;
    }

    public void setTopKBefore(int topKBefore) {
        this.topKBefore = topKBefore;
    }

    public int getTopKAfter() {
        return topKAfter;
    }

    public void setTopKAfter(int topKAfter) {
        this.topKAfter = topKAfter;
    }

    public double getThreshold() {
        return threshold;
    }

    public void setThreshold(double threshold) {
        this.threshold = threshold;
    }
}
