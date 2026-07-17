package com.aichat.controller;

import com.aichat.entity.McpServerConfig;
import com.aichat.repository.McpServerRepository;
import com.aichat.service.McpClientService;
import com.aichat.service.SecurityAuditLogger;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.modelcontextprotocol.spec.McpSchema;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import reactor.core.publisher.Flux;

import java.net.InetAddress;
import java.net.MalformedURLException;
import java.net.URL;
import java.net.UnknownHostException;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/mcp")
@CrossOrigin(originPatterns = "*", allowCredentials = "true")
public class McpController {

    private static final Logger logger = LoggerFactory.getLogger(McpController.class);
    private final ObjectMapper objectMapper = new ObjectMapper();

    private final McpServerRepository serverRepository;
    private final McpClientService mcpClientService;
    private final SecurityAuditLogger securityAuditLogger;

    public McpController(McpServerRepository serverRepository, 
                        McpClientService mcpClientService,
                        SecurityAuditLogger securityAuditLogger) {
        this.serverRepository = serverRepository;
        this.mcpClientService = mcpClientService;
        this.securityAuditLogger = securityAuditLogger;
    }

    @GetMapping("/servers")
    public ResponseEntity<List<McpServerConfig>> getAllServers() {
        logger.info("Fetching all MCP servers");
        List<McpServerConfig> servers = serverRepository.findAll();
        return ResponseEntity.ok(servers);
    }

    @GetMapping("/servers/{id}")
    public ResponseEntity<McpServerConfig> getServer(@PathVariable Long id) {
        logger.info("Fetching MCP server: {}", id);
        return serverRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/servers")
    public ResponseEntity<McpServerConfig> createServer(@RequestBody McpServerConfig serverConfig) {
        logger.info("Creating MCP server: {}", serverConfig.getName());
        
        if (serverConfig.getName() == null || serverConfig.getName().isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        if (serverConfig.getTransportType() == null || serverConfig.getTransportType().isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        
        String transportType = serverConfig.getTransportType();
        if ("HTTP".equalsIgnoreCase(transportType)) {
            if (serverConfig.getUrl() == null || serverConfig.getUrl().isBlank()) {
                return ResponseEntity.badRequest().build();
            }
            String validationResult = validateMcpUrl(serverConfig.getUrl());
            if (validationResult != null) {
                String clientIp = securityAuditLogger.getClientIp();
                securityAuditLogger.logSsrfAttempt(serverConfig.getUrl(), validationResult, clientIp);
                Map<String, String> errorResponse = new HashMap<>();
                errorResponse.put("error", validationResult);
                return ResponseEntity.status(403).body(null);
            }
        } else if ("STDIO".equalsIgnoreCase(transportType)) {
            if (serverConfig.getCommand() == null || serverConfig.getCommand().isBlank()) {
                return ResponseEntity.badRequest().build();
            }
            if (serverConfig.getWorkingDirectory() != null && !serverConfig.getWorkingDirectory().isBlank()) {
                java.io.File dir = new java.io.File(serverConfig.getWorkingDirectory());
                if (!dir.exists() || !dir.isDirectory()) {
                    Map<String, String> errorResponse = new HashMap<>();
                    errorResponse.put("error", "Working directory does not exist");
                    return ResponseEntity.status(400).body(null);
                }
            }
        } else {
            return ResponseEntity.badRequest().build();
        }
        
        LocalDateTime now = LocalDateTime.now();
        serverConfig.setCreatedAt(now);
        serverConfig.setUpdatedAt(now);
        
        McpServerConfig savedServer = serverRepository.save(serverConfig);
        logger.info("Created MCP server with id: {}", savedServer.getId());
        
        return ResponseEntity.status(201).body(savedServer);
    }

    @PutMapping("/servers/{id}")
    public ResponseEntity<McpServerConfig> updateServer(
            @PathVariable Long id,
            @RequestBody McpServerConfig serverConfig) {
        logger.info("Updating MCP server: {}", id);
        
        return serverRepository.findById(id)
                .map(existingServer -> {
                    existingServer.setName(serverConfig.getName());
                    existingServer.setUrl(serverConfig.getUrl());
                    existingServer.setTransportType(serverConfig.getTransportType());
                    existingServer.setCommand(serverConfig.getCommand());
                    existingServer.setWorkingDirectory(serverConfig.getWorkingDirectory());
                    existingServer.setUpdatedAt(LocalDateTime.now());
                    
                    McpServerConfig updated = serverRepository.save(existingServer);
                    logger.info("Updated MCP server: {}", id);
                    return ResponseEntity.ok(updated);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/servers/{id}")
    public ResponseEntity<Void> deleteServer(@PathVariable Long id) {
        logger.info("Deleting MCP server: {}", id);
        
        if (mcpClientService.isConnected(id)) {
            logger.info("Disconnecting from server before deletion: {}", id);
            mcpClientService.disconnectFromServer(id);
        }
        
        if (!serverRepository.existsById(id)) {
            return ResponseEntity.notFound().build();
        }
        
        serverRepository.deleteById(id);
        logger.info("Deleted MCP server: {}", id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/servers/{id}/connect")
    public ResponseEntity<Map<String, Object>> connectToServer(@PathVariable Long id) {
        logger.info("Connecting to MCP server: {}", id);
        
        Map<String, Object> response = new HashMap<>();
        
        McpServerConfig server = serverRepository.findById(id).orElse(null);
        if (server == null) {
            response.put("success", false);
            response.put("error", "Server not found");
            return ResponseEntity.status(404).body(response);
        }
        
        if (mcpClientService.isConnected(id)) {
            response.put("success", true);
            response.put("message", "Already connected");
            response.put("serverId", id);
            response.put("serverName", server.getName());
            return ResponseEntity.ok(response);
        }
        
        McpClientService.ConnectionResult result = mcpClientService.connectToServer(id);
        
        if (result.isSuccess()) {
            response.put("success", true);
            response.put("message", result.getMessage());
            response.put("serverId", id);
            response.put("serverName", server.getName());
            response.put("url", server.getUrl());
            response.put("toolCount", result.getTools().size());
            return ResponseEntity.ok(response);
        } else {
            response.put("success", false);
            response.put("error", result.getMessage());
            response.put("serverId", id);
            return ResponseEntity.status(500).body(response);
        }
    }

    @PostMapping("/servers/{id}/disconnect")
    public ResponseEntity<Map<String, Object>> disconnectFromServer(@PathVariable Long id) {
        logger.info("Disconnecting from MCP server: {}", id);
        
        Map<String, Object> response = new HashMap<>();
        
        McpServerConfig server = serverRepository.findById(id).orElse(null);
        if (server == null) {
            response.put("success", false);
            response.put("error", "Server not found");
            return ResponseEntity.status(404).body(response);
        }
        
        boolean disconnected = mcpClientService.disconnectFromServer(id);
        
        if (disconnected) {
            response.put("success", true);
            response.put("message", "Disconnected successfully");
            response.put("serverId", id);
            response.put("serverName", server.getName());
            return ResponseEntity.ok(response);
        } else {
            response.put("success", false);
            response.put("error", "Not connected or failed to disconnect");
            response.put("serverId", id);
            return ResponseEntity.status(400).body(response);
        }
    }

    @GetMapping("/servers/{id}/connection")
    public ResponseEntity<Map<String, Object>> getConnectionStatus(@PathVariable Long id) {
        logger.info("Checking connection status for MCP server: {}", id);
        
        Map<String, Object> response = new HashMap<>();
        
        McpServerConfig server = serverRepository.findById(id).orElse(null);
        if (server == null) {
            response.put("connected", false);
            response.put("error", "Server not found");
            return ResponseEntity.status(404).body(response);
        }
        
        boolean connected = mcpClientService.isConnected(id);
        response.put("connected", connected);
        response.put("serverId", id);
        response.put("serverName", server.getName());
        
        if (connected) {
            response.put("url", server.getUrl());
        }
        
        return ResponseEntity.ok(response);
    }

    /**
     * Validates MCP server URL to prevent SSRF attacks.
     * Returns null if valid, or error message if blocked.
     */
    private String validateMcpUrl(String urlString) {
        if (urlString == null || urlString.isBlank()) {
            return "URL is required";
        }

        URL url;
        try {
            url = new URL(urlString);
        } catch (MalformedURLException e) {
            return "Invalid URL format";
        }

        // Only allow HTTP and HTTPS schemes
        String protocol = url.getProtocol().toLowerCase();
        if (!"http".equals(protocol) && !"https".equals(protocol)) {
            return "Only HTTP and HTTPS schemes are allowed";
        }

        String host = url.getHost().toLowerCase();
        
        // Block hostnames ending with .internal
        if (host.endsWith(".internal")) {
            return "Internal hostnames (.internal) are not allowed";
        }

        // Resolve hostname to IP address
        InetAddress address;
        try {
            address = InetAddress.getByName(host);
        } catch (UnknownHostException e) {
            return "Unable to resolve hostname";
        }

        String ip = address.getHostAddress();
        
        // Block AWS metadata endpoint
        if ("169.254.169.254".equals(ip)) {
            return "AWS metadata endpoint is not allowed";
        }

        // Allow Docker host gateway (typically 172.17.0.1, 172.18.0.1, 172.19.0.1, etc.)
        // This is needed for container-to-host communication
        boolean isDockerGateway = ip.startsWith("172.17.") || ip.startsWith("172.18.") || 
                                  ip.startsWith("172.19.") || ip.startsWith("172.20.") ||
                                  ip.startsWith("172.21.") || ip.startsWith("172.22.") ||
                                  ip.startsWith("172.23.") || ip.startsWith("172.24.") ||
                                  ip.startsWith("172.25.") || ip.startsWith("172.26.") ||
                                  ip.startsWith("172.27.") || ip.startsWith("172.28.") ||
                                  ip.startsWith("172.29.") || ip.startsWith("172.30.") ||
                                  ip.startsWith("172.31.");
        
        // Block loopback, link-local, site-local, any-local addresses (except Docker gateway)
        if (address.isLoopbackAddress()) {
            return "Loopback addresses are not allowed";
        }
        if (address.isLinkLocalAddress()) {
            return "Link-local addresses are not allowed";
        }
        if (address.isSiteLocalAddress() && !isDockerGateway) {
            return "Site-local (private) addresses are not allowed";
        }
        if (address.isAnyLocalAddress()) {
            return "Any-local addresses are not allowed";
        }

        // Block common internal ports
        int port = url.getPort();
        if (port == -1) {
            port = "https".equals(protocol) ? 443 : 80;
        }
        
        if (port < 1024) {
            return "Privileged ports (<1024) are not allowed";
        }
        if (port == 6379 || port == 27017 || port == 5432 || port == 3306) {
            return "Database ports (6379, 27017, 5432, 3306) are not allowed";
        }

        return null; // Valid URL
    }

    /**
     * Get client IP address from request context.
     */
    private String getClientIp() {
        return securityAuditLogger.getClientIp();
    }

    @GetMapping(value = "/servers/{id}/tools", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<String> listTools(@PathVariable Long id) {
        logger.info("Listing tools for MCP server: {}", id);
        
        return Flux.create(emitter -> {
            try {
                McpServerConfig server = serverRepository.findById(id).orElse(null);
                if (server == null) {
                    String errorJson = "{\"type\":\"error\",\"data\":{\"error\":\"Server not found\",\"serverId\":" + id + "}}";
                    emitter.next(errorJson);
                    emitter.complete();
                    return;
                }
                
                if (!mcpClientService.isConnected(id)) {
                    String errorJson = "{\"type\":\"error\",\"data\":{\"error\":\"Not connected to server\",\"serverId\":" + id + "}}";
                    emitter.next(errorJson);
                    emitter.complete();
                    return;
                }
                
                List<McpClientService.ToolInfo> tools = mcpClientService.listTools(id);
                
                Map<String, Object> toolsResponse = new HashMap<>();
                toolsResponse.put("type", "tools");
                toolsResponse.put("data", tools);
                toolsResponse.put("serverId", id);
                toolsResponse.put("serverName", server.getName());
                toolsResponse.put("count", tools.size());
                
                String toolsJson = objectMapper.writeValueAsString(toolsResponse);
                emitter.next(toolsJson);
                emitter.complete();
                
            } catch (Exception e) {
                logger.error("Error listing tools for MCP server (id={}): {}", id, e.getMessage(), e);
                try {
                    String errorJson = "{\"type\":\"error\",\"data\":{\"error\":\"Failed to list tools: " + e.getMessage() + "\",\"serverId\":" + id + "}}";
                    emitter.next(errorJson);
                    emitter.complete();
                } catch (Exception ex) {
                    emitter.error(ex);
                }
            }
        });
    }

    @GetMapping("/servers/{id}/tools")
    public ResponseEntity<Map<String, Object>> listToolsJson(@PathVariable Long id) {
        logger.info("Listing tools for MCP server: {}", id);
        
        Map<String, Object> response = new HashMap<>();
        
        McpServerConfig server = serverRepository.findById(id).orElse(null);
        if (server == null) {
            logger.warn("Server {} not found", id);
            response.put("success", false);
            response.put("error", "Server not found");
            return ResponseEntity.status(404).body(response);
        }
        
        logger.info("Server {} found, checking connection status", id);
        if (!mcpClientService.isConnected(id)) {
            logger.warn("Server {} is not connected", id);
            response.put("success", false);
            response.put("error", "Not connected to server");
            return ResponseEntity.status(400).body(response);
        }
        
        logger.info("Server {} is connected, calling listTools", id);
        List<McpClientService.ToolInfo> tools = mcpClientService.listTools(id);
        logger.info("Received {} tools from listTools", tools.size());
        
        response.put("success", true);
        response.put("tools", tools);
        response.put("serverId", id);
        response.put("serverName", server.getName());
        response.put("count", tools.size());
        
        return ResponseEntity.ok(response);
    }

    @PostMapping(value = "/servers/{id}/tools/{toolName}", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<String> invokeTool(
            @PathVariable Long id,
            @PathVariable String toolName,
            @RequestBody(required = false) Map<String, Object> args) {
        logger.info("Invoking tool '{}' on MCP server: {}", toolName, id);
        
        final Long serverId = id;
        final String toolNameFinal = toolName;
        
        return Flux.create(emitter -> {
            try {
                McpServerConfig server = serverRepository.findById(serverId).orElse(null);
                if (server == null) {
                    String errorJson = "{\"type\":\"error\",\"data\":{\"error\":\"Server not found\",\"serverId\":" + serverId + "}}";
                    emitter.next(errorJson);
                    emitter.complete();
                    return;
                }
                
                if (!mcpClientService.isConnected(serverId)) {
                    String errorJson = "{\"type\":\"error\",\"data\":{\"error\":\"Not connected to server\",\"serverId\":" + serverId + "}}";
                    emitter.next(errorJson);
                    emitter.complete();
                    return;
                }
                
                Map<String, Object> toolArgs = args != null ? args : new HashMap<>();
                
                McpClientService.ToolCallResult result = mcpClientService.callTool(serverId, toolNameFinal, toolArgs);
                
                Map<String, Object> resultResponse = new HashMap<>();
                resultResponse.put("type", "result");
                resultResponse.put("data", result);
                resultResponse.put("serverId", serverId);
                resultResponse.put("toolName", toolNameFinal);
                
                String resultJson = objectMapper.writeValueAsString(resultResponse);
                emitter.next(resultJson);
                emitter.complete();
                
            } catch (RuntimeException e) {
                if ("Cancelled (server disconnected)".equals(e.getMessage())) {
                    logger.warn("Tool '{}' cancelled due to server disconnect on server {}", toolNameFinal, serverId);
                    try {
                        String errorJson = "{\"type\":\"error\",\"data\":{\"error\":\"Cancelled (server disconnected)\",\"serverId\":" + serverId + ",\"toolName\":\"" + toolNameFinal + "\"}}";
                        emitter.next(errorJson);
                        emitter.complete();
                    } catch (Exception ex) {
                        emitter.error(ex);
                    }
                } else {
                    logger.error("Tool '{}' failed on server {}: {}", toolNameFinal, serverId, e.getMessage(), e);
                    try {
                        String errorMsg = mcpClientService.formatErrorMessageForController(e);
                        String errorJson = "{\"type\":\"error\",\"data\":{\"error\":\"" + errorMsg + "\",\"serverId\":" + serverId + ",\"toolName\":\"" + toolNameFinal + "\"}}";
                        emitter.next(errorJson);
                        emitter.complete();
                    } catch (Exception ex) {
                        emitter.error(ex);
                    }
                }
            } catch (Exception e) {
                logger.error("Tool '{}' failed on server {}: {}", toolNameFinal, serverId, e.getMessage(), e);
                try {
                    String errorMsg = mcpClientService.formatErrorMessageForController(e);
                    String errorJson = "{\"type\":\"error\",\"data\":{\"error\":\"" + errorMsg + "\",\"serverId\":" + serverId + ",\"toolName\":\"" + toolNameFinal + "\"}}";
                    emitter.next(errorJson);
                    emitter.complete();
                } catch (Exception ex) {
                    emitter.error(ex);
                }
            }
        });
    }
}
