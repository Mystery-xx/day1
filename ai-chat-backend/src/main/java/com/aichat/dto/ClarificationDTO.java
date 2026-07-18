package com.aichat.dto;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.time.Instant;

public class ClarificationDTO {
    private String question;
    private String answer;
    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd'T'HH:mm:ss.SSSX")
    private Instant timestamp;

    public ClarificationDTO() {
    }

    public ClarificationDTO(String question, String answer, Instant timestamp) {
        this.question = question;
        this.answer = answer;
        this.timestamp = timestamp;
    }

    public String getQuestion() {
        return question;
    }

    public void setQuestion(String question) {
        this.question = question;
    }

    public String getAnswer() {
        return answer;
    }

    public void setAnswer(String answer) {
        this.answer = answer;
    }

    public Instant getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(Instant timestamp) {
        this.timestamp = timestamp;
    }
}
