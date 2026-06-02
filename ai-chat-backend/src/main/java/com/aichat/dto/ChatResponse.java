package com.aichat.dto;

public class ChatResponse {
    private String content;
    private String error;

    public ChatResponse() {}

    public ChatResponse(String content, String error) {
        this.content = content;
        this.error = error;
    }

    public static ChatResponse success(String content) {
        return new ChatResponse(content, null);
    }

    public static ChatResponse error(String error) {
        return new ChatResponse(null, error);
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getError() {
        return error;
    }

    public void setError(String error) {
        this.error = error;
    }
}
