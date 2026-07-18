package com.aichat.service.codereview;

/**
 * A single finding from a code review sub-agent.
 */
public class Finding {
    private String file;
    private int line;
    private Severity severity;
    private String description;
    private String suggestion;
    private String category;

    public Finding() {
    }

    public Finding(String file, int line, Severity severity,
                   String description, String suggestion, String category) {
        this.file = file;
        this.line = line;
        this.severity = severity;
        this.description = description;
        this.suggestion = suggestion;
        this.category = category;
    }

    public String getFile() {
        return file;
    }

    public void setFile(String file) {
        this.file = file;
    }

    public int getLine() {
        return line;
    }

    public void setLine(int line) {
        this.line = line;
    }

    public Severity getSeverity() {
        return severity;
    }

    public void setSeverity(Severity severity) {
        this.severity = severity;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getSuggestion() {
        return suggestion;
    }

    public void setSuggestion(String suggestion) {
        this.suggestion = suggestion;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }
}
