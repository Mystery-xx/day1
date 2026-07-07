package com.aichat.dto;

import java.util.List;
import java.util.Map;

public class ChatRequest {
    private String sessionId;
    private String message;
    private Boolean useRag = false;
    private Boolean useRerank = false;
    private Boolean useRewrite = false;
    private Double ragThreshold = 0.0;
    private List<Message> history;
    private ModelSettings settings;

    public static class Message {
        private String role;
        private String content;

        public Message() {}

        public Message(String role, String content) {
            this.role = role;
            this.content = content;
        }

        public String getRole() {
            return role;
        }

        public void setRole(String role) {
            this.role = role;
        }

        public String getContent() {
            return content;
        }

        public void setContent(String content) {
            this.content = content;
        }
    }

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public Boolean getUseRag() {
        return useRag;
    }

    public void setUseRag(Boolean useRag) {
        this.useRag = useRag;
    }

    public Boolean getUseRerank() {
        return useRerank;
    }

    public void setUseRerank(Boolean useRerank) {
        this.useRerank = useRerank;
    }

    public Double getRagThreshold() {
        return ragThreshold;
    }

    public void setRagThreshold(Double ragThreshold) {
        this.ragThreshold = ragThreshold;
    }

    public Boolean getUseRewrite() {
        return useRewrite;
    }

    public void setUseRewrite(Boolean useRewrite) {
        this.useRewrite = useRewrite;
    }

    public List<Message> getHistory() {
        return history;
    }

    public void setHistory(List<Message> history) {
        this.history = history;
    }

    public ModelSettings getSettings() {
        return settings;
    }

    public void setSettings(ModelSettings settings) {
        this.settings = settings;
    }

    public static class ModelSettings {
        private String provider;
        private String model;
        private Double temperature;
        private Integer maxTokens;
        private Double topP;
        private Double frequencyPenalty;
        private Double presencePenalty;
        private List<String> stop;
        private Boolean sendHistory;
        private String contextStrategy;
        private Integer contextWindowSize;
        private Map<String, String> stickyFacts;
        private Boolean autoExtractFacts;

        public String getProvider() {
            return provider;
        }

        public void setProvider(String provider) {
            this.provider = provider;
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

        public Boolean getSendHistory() {
            return sendHistory;
        }

        public void setSendHistory(Boolean sendHistory) {
            this.sendHistory = sendHistory;
        }

        public String getContextStrategy() {
            return contextStrategy;
        }

        public void setContextStrategy(String contextStrategy) {
            this.contextStrategy = contextStrategy;
        }

        public Integer getContextWindowSize() {
            return contextWindowSize;
        }

        public void setContextWindowSize(Integer contextWindowSize) {
            this.contextWindowSize = contextWindowSize;
        }

        public Map<String, String> getStickyFacts() {
            return stickyFacts;
        }

        public void setStickyFacts(Map<String, String> stickyFacts) {
            this.stickyFacts = stickyFacts;
        }

        public Boolean getAutoExtractFacts() {
            return autoExtractFacts;
        }

        public void setAutoExtractFacts(Boolean autoExtractFacts) {
            this.autoExtractFacts = autoExtractFacts;
        }
    }
}
