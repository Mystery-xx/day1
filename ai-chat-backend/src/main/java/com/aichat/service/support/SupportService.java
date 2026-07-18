package com.aichat.service.support;

import com.aichat.dto.RagContextResult;
import com.aichat.dto.SourceInfo;
import com.aichat.dto.support.SupportChatRequest;
import com.aichat.dto.support.SupportChatResponse;
import com.aichat.dto.support.TicketContext;
import com.aichat.dto.support.TicketDTO;
import com.aichat.service.RagSearchService;
import com.aichat.service.ollama.OllamaChatRequest;
import com.aichat.service.ollama.OllamaChatResponse;
import com.aichat.service.ollama.OllamaClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Service for orchestrating support chat with RAG + LLM.
 * 
 * This service handles the support conversation flow:
 * 1. Load ticket context
 * 2. Search FAQ/knowledge base
 * 3. Generate AI response with context
 */
@Service
public class SupportService {

    private static final Logger logger = LoggerFactory.getLogger(SupportService.class);

    private final TicketService ticketService;
    private final RagSearchService ragSearchService;
    private final OllamaClient ollamaClient;

    @Value("${OLLAMA_MODEL:llama3.2}")
    private String ollamaModel;

    public SupportService(TicketService ticketService, RagSearchService ragSearchService, OllamaClient ollamaClient) {
        this.ticketService = ticketService;
        this.ragSearchService = ragSearchService;
        this.ollamaClient = ollamaClient;
    }

    /**
     * Process a support chat message and return AI-generated response.
     *
     * @param request The support chat request containing ticketId, message, and userId
     * @return SupportChatResponse with answer, sources, and ticket context
     */
    public SupportChatResponse chat(SupportChatRequest request) {
        logger.info("Processing support chat for ticket: {}", request.getTicketId());
        
        // 1. Load ticket
        Optional<TicketDTO> ticketOpt = ticketService.findById(request.getTicketId());
        if (ticketOpt.isEmpty()) {
            logger.warn("Ticket not found: {}", request.getTicketId());
            throw new IllegalArgumentException("Ticket not found: " + request.getTicketId());
        }
        TicketDTO ticket = ticketOpt.get();
        logger.info("Loaded ticket: {} - {}", ticket.getTicketId(), ticket.getSubject());
        
        // 2. Build TicketContext
        TicketContext ticketContext = buildTicketContext(ticket);
        logger.info("Built ticket context for user: {}", ticketContext.getUserName());
        
        // 3. RAG search with topK=3
        RagContextResult ragResult = ragSearchService.searchAndAugment(
            request.getMessage(), 
            3,      // topK
            false,  // withEmbedding
            0.0,    // threshold
            false   // rerank
        );
        logger.info("RAG search completed: found {} sources", 
            ragResult.getSources() != null ? ragResult.getSources().size() : 0);
        
        // 4. Build prompt with ticket context + RAG sources
        List<OllamaChatRequest.Message> messages = buildMessages(request.getMessage(), ticketContext, ragResult);
        logger.info("Built prompt with {} messages", messages.size());
        
        // 5. Call LLM via OllamaClient
        OllamaChatResponse ollamaResponse;
        try {
            ollamaResponse = ollamaClient.chat(messages, ollamaModel);
            logger.info("LLM response received: {} chars", 
                ollamaResponse.getMessage().getContent().length());
        } catch (Exception e) {
            logger.error("LLM call failed", e);
            throw new RuntimeException("Failed to generate AI response: " + e.getMessage(), e);
        }
        
        // 6. Build and return response
        SupportChatResponse response = new SupportChatResponse();
        response.setAnswer(ollamaResponse.getMessage().getContent());
        response.setSources(extractSources(ragResult));
        response.setTicketContext(ticketContext);
        
        logger.info("Support chat response generated successfully for ticket: {}", request.getTicketId());
        return response;
    }
    
    /**
     * Build TicketContext from TicketDTO.
     */
    private TicketContext buildTicketContext(TicketDTO ticket) {
        TicketContext context = new TicketContext();
        context.setTicketId(ticket.getTicketId());
        context.setSubject(ticket.getSubject());
        context.setStatus(ticket.getStatus());
        context.setPriority(ticket.getPriority());
        context.setUserName(ticket.getUserName());
        context.setUserEmail(ticket.getUserEmail());
        context.setUserPlan(null); // Can be extended if user plan info is available
        return context;
    }
    
    /**
     * Build messages for LLM with ticket context and RAG sources.
     */
    private List<OllamaChatRequest.Message> buildMessages(
            String userMessage, 
            TicketContext ticketContext, 
            RagContextResult ragResult) {
        
        List<OllamaChatRequest.Message> messages = new ArrayList<>();
        
        // System message with ticket context and RAG sources
        StringBuilder systemPrompt = new StringBuilder();
        systemPrompt.append("You are a helpful support assistant. Use the following context to answer the user's question.\n\n");
        
        // Add ticket context
        systemPrompt.append("=== TICKET CONTEXT ===\n");
        systemPrompt.append("Ticket ID: ").append(ticketContext.getTicketId()).append("\n");
        systemPrompt.append("Subject: ").append(ticketContext.getSubject()).append("\n");
        systemPrompt.append("Status: ").append(ticketContext.getStatus()).append("\n");
        systemPrompt.append("Priority: ").append(ticketContext.getPriority()).append("\n");
        systemPrompt.append("User: ").append(ticketContext.getUserName())
            .append(" (").append(ticketContext.getUserEmail()).append(")\n\n");
        
        // Add RAG sources
        if (ragResult.getSources() != null && !ragResult.getSources().isEmpty()) {
            systemPrompt.append("=== KNOWLEDGE BASE SOURCES ===\n");
            for (int i = 0; i < ragResult.getSources().size(); i++) {
                SourceInfo source = ragResult.getSources().get(i);
                systemPrompt.append("[").append(i + 1).append("] ")
                    .append(source.getTitle())
                    .append(" (").append(source.getSource()).append(")\n");
                systemPrompt.append("Section: ").append(source.getSection()).append("\n");
                systemPrompt.append("Similarity: ").append(String.format("%.2f", source.getSimilarity()));
                if (source.getRerankScore() != null) {
                    systemPrompt.append(", Rerank Score: ").append(String.format("%.2f", source.getRerankScore()));
                }
                systemPrompt.append("\n\n");
            }
        } else {
            systemPrompt.append("=== KNOWLEDGE BASE SOURCES ===\n");
            systemPrompt.append("No relevant sources found in the knowledge base.\n\n");
        }
        
        systemPrompt.append("=== INSTRUCTIONS ===\n");
        systemPrompt.append("Answer the user's question based on the ticket context and knowledge base sources above. ");
        systemPrompt.append("If the sources don't contain relevant information, provide a helpful general response and mention that you couldn't find specific documentation.\n");
        
        messages.add(new OllamaChatRequest.Message("system", systemPrompt.toString()));
        
        // User message
        messages.add(new OllamaChatRequest.Message("user", userMessage));
        
        return messages;
    }
    
    /**
     * Extract source strings from RagContextResult.
     */
    private List<String> extractSources(RagContextResult ragResult) {
        if (ragResult.getSources() == null || ragResult.getSources().isEmpty()) {
            return new ArrayList<>();
        }
        
        List<String> sources = new ArrayList<>();
        for (SourceInfo source : ragResult.getSources()) {
            StringBuilder sourceStr = new StringBuilder();
            sourceStr.append(source.getTitle());
            if (source.getSource() != null && !source.getSource().isBlank()) {
                sourceStr.append(" (").append(source.getSource()).append(")");
            }
            if (source.getSection() != null && !source.getSection().isBlank()) {
                sourceStr.append(" - ").append(source.getSection());
            }
            sources.add(sourceStr.toString());
        }
        return sources;
    }
}
