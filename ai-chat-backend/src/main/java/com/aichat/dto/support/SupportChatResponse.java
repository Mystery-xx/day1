package com.aichat.dto.support;

import java.util.List;

public class SupportChatResponse {
    private String answer;
    private List<String> sources;
    private TicketContext ticketContext;
    
    public SupportChatResponse() {}
    
    public String getAnswer() { return answer; }
    public void setAnswer(String answer) { this.answer = answer; }
    
    public List<String> getSources() { return sources; }
    public void setSources(List<String> sources) { this.sources = sources; }
    
    public TicketContext getTicketContext() { return ticketContext; }
    public void setTicketContext(TicketContext ticketContext) { this.ticketContext = ticketContext; }
}
