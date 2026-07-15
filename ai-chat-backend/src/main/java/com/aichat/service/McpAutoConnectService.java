package com.aichat.service;

import com.aichat.entity.McpServerConfig;
import com.aichat.repository.McpServerRepository;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Optional;

/**
 * Auto-connects to the MCP assistant server on application startup.
 */
@Service
public class McpAutoConnectService {

    private static final Logger logger = LoggerFactory.getLogger(McpAutoConnectService.class);

    private static final String ASSISTANT_SERVER_NAME = "mcp-assistant";
    private static final String ASSISTANT_COMMAND = "npm run mcp:assistant";
    private static final String ASSISTANT_WORKING_DIR = "/mnt/f/git/day1/mcp-assistant";

    private final McpServerRepository serverRepository;
    private final McpClientService mcpClientService;

    @Autowired
    public McpAutoConnectService(McpServerRepository serverRepository, McpClientService mcpClientService) {
        this.serverRepository = serverRepository;
        this.mcpClientService = mcpClientService;
    }

    @PostConstruct
    public void autoConnectAssistant() {
        logger.info("=== MCP Auto-Connect: Starting assistant auto-connection ===");

        try {
            // Check if assistant already exists
            Optional<McpServerConfig> existing = serverRepository.findByName(ASSISTANT_SERVER_NAME);

            McpServerConfig assistantConfig;
            if (existing.isPresent()) {
                assistantConfig = existing.get();
                logger.info("MCP Auto-Connect: Found existing assistant server with id={}", assistantConfig.getId());
            } else {
                // Create new server config
                assistantConfig = new McpServerConfig();
                assistantConfig.setName(ASSISTANT_SERVER_NAME);
                assistantConfig.setTransportType("STDIO");
                assistantConfig.setCommand(ASSISTANT_COMMAND);
                assistantConfig.setWorkingDirectory(ASSISTANT_WORKING_DIR);
                assistantConfig.setStatus("active");

                LocalDateTime now = LocalDateTime.now();
                assistantConfig.setCreatedAt(now);
                assistantConfig.setUpdatedAt(now);

                assistantConfig = serverRepository.save(assistantConfig);
                logger.info("MCP Auto-Connect: Created new assistant server with id={}", assistantConfig.getId());
            }

            // Connect to assistant
            if (mcpClientService.isConnected(assistantConfig.getId())) {
                logger.info("MCP Auto-Connect: Already connected to assistant (id={})", assistantConfig.getId());
            } else {
                logger.info("MCP Auto-Connect: Connecting to assistant (id={})...", assistantConfig.getId());
                McpClientService.ConnectionResult result = mcpClientService.connectToServer(assistantConfig.getId());

                if (result.isSuccess()) {
                    logger.info("MCP Auto-Connect: SUCCESS - Connected to assistant with {} tools", result.getTools().size());
                } else {
                    logger.warn("MCP Auto-Connect: FAILED - {}", result.getMessage());
                }
            }

            logger.info("=== MCP Auto-Connect: Completed ===");

        } catch (Exception e) {
            logger.error("MCP Auto-Connect: ERROR during auto-connection - {}", e.getMessage(), e);
            // Don't rethrow - don't block application startup
        }
    }
}