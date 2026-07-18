package com.aichat.service.mcp;

import com.aichat.dto.support.TicketDTO;
import com.aichat.entity.SupportUser;
import com.aichat.service.support.TicketService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * MCP CRM server providing tools for accessing ticket and user data.
 * 
 * This server exposes three tools:
 * - get_ticket(ticketId): Retrieve a specific ticket by ID
 * - get_user(userId): Retrieve a specific user by ID
 * - list_tickets(userId): List all tickets for a specific user
 */
@Component
public class CrmMcpServer {

    private static final Logger logger = LoggerFactory.getLogger(CrmMcpServer.class);

    private final TicketService ticketService;

    public CrmMcpServer(TicketService ticketService) {
        this.ticketService = ticketService;
    }

    /**
     * Retrieve a specific ticket by its ID.
     * 
     * @param ticketId The ticket ID (e.g., "TKT-001")
     * @return TicketDTO if found, null otherwise
     */
    @Tool(name = "get_ticket", description = "Retrieve a specific ticket by its ID")
    public TicketDTO getTicket(String ticketId) {
        logger.info(">>> MCP TOOL CALL [get_ticket] - ticketId={}", ticketId);
        
        try {
            return ticketService.findById(ticketId).orElse(null);
        } catch (Exception e) {
            logger.error("Failed to get ticket {}: {}", ticketId, e.getMessage(), e);
            return null;
        }
    }

    /**
     * Retrieve a specific user by their ID.
     * 
     * @param userId The user ID
     * @return SupportUser if found, null otherwise
     */
    @Tool(name = "get_user", description = "Retrieve a specific user by their ID")
    public SupportUser getUser(String userId) {
        logger.info(">>> MCP TOOL CALL [get_user] - userId={}", userId);
        
        try {
            return ticketService.findUserById(userId);
        } catch (Exception e) {
            logger.error("Failed to get user {}: {}", userId, e.getMessage(), e);
            return null;
        }
    }

    /**
     * List all tickets for a specific user.
     * 
     * @param userId The user ID to filter tickets by
     * @return List of TicketDTO objects (empty list if user has no tickets)
     */
    @Tool(name = "list_tickets", description = "List all tickets for a specific user")
    public List<TicketDTO> listTickets(String userId) {
        logger.info(">>> MCP TOOL CALL [list_tickets] - userId={}", userId);
        
        try {
            return ticketService.findByUserId(userId);
        } catch (Exception e) {
            logger.error("Failed to list tickets for user {}: {}", userId, e.getMessage(), e);
            return List.of();
        }
    }
}
