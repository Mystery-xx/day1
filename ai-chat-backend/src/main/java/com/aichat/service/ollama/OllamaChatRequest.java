package com.aichat.service.ollama;

import java.util.List;

/**
 * Request DTO for Ollama chat API (native Ollama format).
 */
public class OllamaChatRequest {
    private String model;
    private List<Message> messages;
    private boolean stream;

    public OllamaChatRequest() {
        // Default constructor for JSON deserialization
    }

    public OllamaChatRequest(String model, List<Message> messages, boolean stream) {
        this.model = model;
        this.messages = messages;
        this.stream = stream;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public List<Message> getMessages() {
        return messages;
    }

    public void setMessages(List<Message> messages) {
        this.messages = messages;
    }

    public boolean isStream() {
        return stream;
    }

    public void setStream(boolean stream) {
        this.stream = stream;
    }

    /**
     * Message DTO for Ollama chat API.
     */
    public static class Message {
        private String role;
        private String content;

        public Message() {
            // Default constructor for JSON deserialization
        }

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
}
