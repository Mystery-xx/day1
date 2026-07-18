package com.aichat.controller;

import com.aichat.dto.support.SupportChatRequest;
import com.aichat.dto.support.SupportChatResponse;
import com.aichat.dto.support.TicketDTO;
import com.aichat.service.support.SupportService;
import com.aichat.service.support.TicketService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * REST controller for support chat functionality.
 * Provides endpoints for support conversations and ticket management.
 */
@RestController
@RequestMapping("/api/support")
@CrossOrigin(originPatterns = "*", allowCredentials = "true")
public class SupportController {

    private static final Logger logger = LoggerFactory.getLogger(SupportController.class);

    private final SupportService supportService;
    private final TicketService ticketService;

    /**
     * Constructor injection for support service and ticket service.
     *
     * @param supportService Service for handling support chat interactions
     * @param ticketService Service for managing support tickets
     */
    public SupportController(SupportService supportService, TicketService ticketService) {
        this.supportService = supportService;
        this.ticketService = ticketService;
    }

    /**
     * Process a support chat message and return AI-generated response.
     *
     * @param request The support chat request containing ticketId, message, and userId
     * @return SupportChatResponse with answer, sources, and ticket context
     */
    @PostMapping("/chat")
    public ResponseEntity<SupportChatResponse> chat(@RequestBody SupportChatRequest request) {
        logger.info("Received support chat request");
        
        if (request.getMessage() == null || request.getMessage().isBlank()) {
            logger.warn("Support chat request with empty message");
            return ResponseEntity.badRequest().build();
        }
        
        if (request.getUserId() == null || request.getUserId().isBlank()) {
            logger.warn("Support chat request with empty userId");
            return ResponseEntity.badRequest().build();
        }
        
        try {
            SupportChatResponse response = supportService.chat(request);
            logger.info("Support chat response generated successfully");
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            logger.error("Error processing support chat request", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * List all support tickets.
     *
     * @return List of all tickets
     */
    @GetMapping("/tickets")
    public ResponseEntity<List<TicketDTO>> getAllTickets() {
        logger.info("Fetching all support tickets");
        
        try {
            List<TicketDTO> tickets = ticketService.findAll();
            logger.info("Retrieved {} tickets", tickets.size());
            return ResponseEntity.ok(tickets);
        } catch (Exception e) {
            logger.error("Error fetching tickets", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Get a specific ticket by ID.
     *
     * @param ticketId The ticket identifier
     * @return TicketDTO if found
     */
    @GetMapping("/tickets/{ticketId}")
    public ResponseEntity<TicketDTO> getTicketById(@PathVariable String ticketId) {
        logger.info("Fetching ticket: {}", ticketId);
        
        try {
            TicketDTO ticket = ticketService.findById(ticketId).orElse(null);
            if (ticket == null) {
                logger.warn("Ticket not found: {}", ticketId);
                return ResponseEntity.notFound().build();
            }
            logger.info("Retrieved ticket: {}", ticketId);
            return ResponseEntity.ok(ticket);
        } catch (IllegalArgumentException e) {
            logger.warn("Ticket not found: {}", ticketId);
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            logger.error("Error fetching ticket: {}", ticketId, e);
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Get all tickets for a specific user.
     *
     * @param userId The user identifier (can be userName or userEmail)
     * @return List of tickets belonging to the user
     */
    @GetMapping("/tickets/user/{userId}")
    public ResponseEntity<List<TicketDTO>> getTicketsByUser(@PathVariable String userId) {
        logger.info("Fetching tickets for user: {}", userId);
        
        try {
            List<TicketDTO> tickets = ticketService.findByUserId(userId);
            logger.info("Retrieved {} tickets for user: {}", tickets.size(), userId);
            return ResponseEntity.ok(tickets);
        } catch (Exception e) {
            logger.error("Error fetching tickets for user: {}", userId, e);
            return ResponseEntity.internalServerError().build();
        }
    }
}
