package com.aichat.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
@ConfigurationProperties(prefix = "ai.api")
public class AiChatProperties {
    private String provider;
    private String key;
    private String url;
    private String gpustackUrl;
    private String huggingfaceUrl;
    private String huggingfaceToken;
    private String model;
    private Double temperature = 1.0;
    private Integer maxTokens = null;
    private Double topP = 1.0;
    private Double frequencyPenalty = 0.0;
    private Double presencePenalty = 0.0;
    private List<String> stop;

    public String getProvider() {
        return provider;
    }

    public void setProvider(String provider) {
        this.provider = provider;
    }

    public String getKey() {
        return key;
    }

    public void setKey(String key) {
        this.key = key;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public String getGpustackUrl() {
        return gpustackUrl;
    }

    public void setGpustackUrl(String gpustackUrl) {
        this.gpustackUrl = gpustackUrl;
    }

    public String getHuggingfaceUrl() {
        return huggingfaceUrl;
    }

    public void setHuggingfaceUrl(String huggingfaceUrl) {
        this.huggingfaceUrl = huggingfaceUrl;
    }

    public String getHuggingfaceToken() {
        return huggingfaceToken;
    }

    public void setHuggingfaceToken(String huggingfaceToken) {
        this.huggingfaceToken = huggingfaceToken;
    }

    public String getProviderBaseUrl() {
        if ("huggingface".equalsIgnoreCase(provider)) {
            return huggingfaceUrl != null ? huggingfaceUrl : url;
        } else {
            return gpustackUrl != null ? gpustackUrl : url;
        }
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public Double getTemperature() {
        return temperature;
    }

    public void setTemperature(Double temperature) {
        this.temperature = temperature;
    }

    public Integer getMaxTokens() {
        return maxTokens;
    }

    public void setMaxTokens(Integer maxTokens) {
        this.maxTokens = maxTokens;
    }

    public Double getTopP() {
        return topP;
    }

    public void setTopP(Double topP) {
        this.topP = topP;
    }

    public Double getFrequencyPenalty() {
        return frequencyPenalty;
    }

    public void setFrequencyPenalty(Double frequencyPenalty) {
        this.frequencyPenalty = frequencyPenalty;
    }

    public Double getPresencePenalty() {
        return presencePenalty;
    }

    public void setPresencePenalty(Double presencePenalty) {
        this.presencePenalty = presencePenalty;
    }

    public List<String> getStop() {
        return stop;
    }

    public void setStop(List<String> stop) {
        this.stop = stop;
    }
}
