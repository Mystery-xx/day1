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
    private static final String ASSISTANT_URL = "http://mcp-assistant:3000/mcp";
    private static final String ASSISTANT_TRANSPORT_TYPE = "HTTP";

    private static final String FILE_ASSISTANT_SERVER_NAME = "file-assistant";
    private static final String FILE_ASSISTANT_URL = "http://file-assistant:3000/mcp";
    private static final String FILE_ASSISTANT_TRANSPORT_TYPE = "HTTP";

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
            connectToServer(ASSISTANT_SERVER_NAME, ASSISTANT_URL, ASSISTANT_TRANSPORT_TYPE);
            connectToServer(FILE_ASSISTANT_SERVER_NAME, FILE_ASSISTANT_URL, FILE_ASSISTANT_TRANSPORT_TYPE);
            logger.info("=== MCP Auto-Connect: Completed ===");

        } catch (Exception e) {
            logger.error("MCP Auto-Connect: ERROR during auto-connection - {}", e.getMessage(), e);
        }
    }

    private void connectToServer(String name, String url, String transportType) {
        logger.info("MCP Auto-Connect: Connecting to {} at {}...", name, url);
        
        try {
            Optional<McpServerConfig> existing = serverRepository.findByName(name);

            McpServerConfig serverConfig;
            if (existing.isPresent()) {
                serverConfig = existing.get();
                logger.info("MCP Auto-Connect: Found existing server '{}' with id={}", name, serverConfig.getId());
            } else {
                serverConfig = new McpServerConfig();
                serverConfig.setName(name);
                serverConfig.setTransportType(transportType);
                serverConfig.setUrl(url);
                serverConfig.setStatus("active");

                LocalDateTime now = LocalDateTime.now();
                serverConfig.setCreatedAt(now);
                serverConfig.setUpdatedAt(now);

                serverConfig = serverRepository.save(serverConfig);
                logger.info("MCP Auto-Connect: Created new server '{}' with id={}", name, serverConfig.getId());
            }

            if (mcpClientService.isConnected(serverConfig.getId())) {
                logger.info("MCP Auto-Connect: Already connected to '{}' (id={})", name, serverConfig.getId());
            } else {
                logger.info("MCP Auto-Connect: Connecting to '{}' (id={})...", name, serverConfig.getId());
                McpClientService.ConnectionResult result = mcpClientService.connectToServer(serverConfig.getId());

                if (result.isSuccess()) {
                    logger.info("MCP Auto-Connect: SUCCESS - Connected to '{}' with {} tools", name, result.getTools().size());
                } else {
                    logger.warn("MCP Auto-Connect: FAILED - {}", result.getMessage());
                }
            }
        } catch (Exception e) {
            logger.error("MCP Auto-Connect: ERROR connecting to '{}' - {}", name, e.getMessage(), e);
        }
    }
}