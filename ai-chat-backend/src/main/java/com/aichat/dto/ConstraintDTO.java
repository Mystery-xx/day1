package com.aichat.dto;

public class ConstraintDTO {
    private String type;  // TECHNICAL, TIME, BUDGET, SCOPE
    private String description;
    private Boolean isViolated;

    public ConstraintDTO() {
    }

    public ConstraintDTO(String type, String description, Boolean isViolated) {
        this.type = type;
        this.description = description;
        this.isViolated = isViolated;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public Boolean getIsViolated() {
        return isViolated;
    }

    public void setIsViolated(Boolean isViolated) {
        this.isViolated = isViolated;
    }
}
