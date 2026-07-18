package com.aichat.service.codereview;

/**
 * Represents a single file changed in a PR diff.
 */
public class FileChange {
    private String filename;
    private int additions;
    private int deletions;
    private boolean binary;

    public FileChange() {
    }

    public FileChange(String filename, int additions, int deletions, boolean binary) {
        this.filename = filename;
        this.additions = additions;
        this.deletions = deletions;
        this.binary = binary;
    }

    public String getFilename() {
        return filename;
    }

    public void setFilename(String filename) {
        this.filename = filename;
    }

    public int getAdditions() {
        return additions;
    }

    public void setAdditions(int additions) {
        this.additions = additions;
    }

    public int getDeletions() {
        return deletions;
    }

    public void setDeletions(int deletions) {
        this.deletions = deletions;
    }

    public boolean isBinary() {
        return binary;
    }

    public void setBinary(boolean binary) {
        this.binary = binary;
    }
}
