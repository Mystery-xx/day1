package com.aichat.service.ollama;

/**
 * Response DTO for Ollama chat API (native Ollama format).
 */
public class OllamaChatResponse {
    private String model;
    private Message message;
    private boolean done;
    private Long total_duration;
    private Long load_duration;
    private Long prompt_eval_count;
    private Long prompt_eval_duration;
    private Long eval_count;
    private Long eval_duration;

    public OllamaChatResponse() {
        // Default constructor for JSON deserialization
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public Message getMessage() {
        return message;
    }

    public void setMessage(Message message) {
        this.message = message;
    }

    public boolean isDone() {
        return done;
    }

    public void setDone(boolean done) {
        this.done = done;
    }

    public Long getTotal_duration() {
        return total_duration;
    }

    public void setTotal_duration(Long total_duration) {
        this.total_duration = total_duration;
    }

    public Long getLoad_duration() {
        return load_duration;
    }

    public void setLoad_duration(Long load_duration) {
        this.load_duration = load_duration;
    }

    public Long getPrompt_eval_count() {
        return prompt_eval_count;
    }

    public void setPrompt_eval_count(Long prompt_eval_count) {
        this.prompt_eval_count = prompt_eval_count;
    }

    public Long getPrompt_eval_duration() {
        return prompt_eval_duration;
    }

    public void setPrompt_eval_duration(Long prompt_eval_duration) {
        this.prompt_eval_duration = prompt_eval_duration;
    }

    public Long getEval_count() {
        return eval_count;
    }

    public void setEval_count(Long eval_count) {
        this.eval_count = eval_count;
    }

    public Long getEval_duration() {
        return eval_duration;
    }

    public void setEval_duration(Long eval_duration) {
        this.eval_duration = eval_duration;
    }

    /**
     * Message DTO for Ollama chat response.
     */
    public static class Message {
        private String role;
        private String content;

        public Message() {
            // Default constructor for JSON deserialization
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
