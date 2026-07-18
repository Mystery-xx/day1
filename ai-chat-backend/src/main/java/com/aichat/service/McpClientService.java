package com.aichat.service;

import com.aichat.entity.McpServerConfig;
import com.aichat.repository.McpServerRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class McpClientService {

    private static final Logger logger = LoggerFactory.getLogger(McpClientService.class);

    private final McpServerRepository serverRepository;
    private final McpSessionClient sessionClient;
    private final McpHttpService mcpHttpService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private final ConcurrentHashMap<Long, ConnectionStatus> connectionStates = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Long, List<McpSessionClient.ToolInfo>> toolCache = new ConcurrentHashMap<>();
    
    @Autowired(required = false)
    private StdioMcpTransport stdioTransport;

    public McpClientService(McpServerRepository serverRepository, McpSessionClient sessionClient, McpHttpService mcpHttpService) {
        this.serverRepository = serverRepository;
        this.sessionClient = sessionClient;
        this.mcpHttpService = mcpHttpService;
    }

    public ConnectionResult connectToServer(Long serverId) {
        logger.info("Connecting to MCP server with ID: {}", serverId);
        
        McpServerConfig serverConfig = serverRepository.findById(serverId)
                .orElseThrow(() -> new RuntimeException("MCP server not found with ID: " + serverId));
        
        return connectInternal(serverConfig);
    }

    public boolean connect(McpServerConfig serverConfig) {
        logger.info("Connecting to MCP server: {} (id={}, url={})", 
                serverConfig.getName(), serverConfig.getId(), serverConfig.getUrl());
        
        ConnectionResult result = connectInternal(serverConfig);
        return result.isSuccess();
    }

    private ConnectionResult connectInternal(McpServerConfig serverConfig) {
        try {
            connectionStates.put(serverConfig.getId(), ConnectionStatus.CONNECTING);
            
            // Start stdio process if needed
            if ("STDIO".equalsIgnoreCase(serverConfig.getTransportType())) {
                if (stdioTransport == null) {
                    logger.error("Stdio transport not available");
                    connectionStates.put(serverConfig.getId(), ConnectionStatus.ERROR);
                    return new ConnectionResult(false, "Stdio transport not available", List.of());
                }
                
                StdioMcpTransport.TransportResult result = stdioTransport.startServer(
                    serverConfig.getId(),
                    serverConfig.getCommand(),
                    serverConfig.getWorkingDirectory()
                );
                
                if (!result.success()) {
                    logger.error("Failed to start stdio server: {}", result.error());
                    connectionStates.put(serverConfig.getId(), ConnectionStatus.ERROR);
                    return new ConnectionResult(false, result.error(), List.of());
                }
                
                // Initialize stdio session
                McpSessionClient.SessionInfo sessionInfo = sessionClient.initialize(
                    serverConfig.getId().toString(), 
                    null,
                    "STDIO"
                );
                
                if (!sessionInfo.isConnected()) {
                    logger.warn("Failed to initialize MCP server {}: {}", serverConfig.getName(), sessionInfo.getMessage());
                    connectionStates.put(serverConfig.getId(), ConnectionStatus.ERROR);
                    stdioTransport.stopServer(serverConfig.getId());
                    return new ConnectionResult(false, sessionInfo.getMessage(), List.of());
                }
                
            } else if ("HTTP".equalsIgnoreCase(serverConfig.getTransportType())) {
                // Use mcpHttpService for initialization (handles Accept headers correctly)
                logger.info("Using HTTP service for MCP server: {}", serverConfig.getName());
                
                McpHttpService.InitializeResult initResult = mcpHttpService.initialize(serverConfig.getUrl());
                
                if (!initResult.isSuccess()) {
                    logger.error("Failed to initialize HTTP MCP server {}: {}", serverConfig.getName(), initResult.getMessage());
                    connectionStates.put(serverConfig.getId(), ConnectionStatus.ERROR);
                    return new ConnectionResult(false, initResult.getMessage(), List.of());
                }
                
                // Manually store client in map for tool calls (avoids SDK Accept header issue)
                sessionClient.storeHttpClient(serverConfig.getId().toString(), serverConfig.getUrl());
                
                logger.info("HTTP MCP session stored successfully for server: {}", serverConfig.getName());
            }
            
            connectionStates.put(serverConfig.getId(), ConnectionStatus.CONNECTED);
            
            // List tools using appropriate client based on transport type
            List<McpSessionClient.ToolInfo> tools;
            if ("HTTP".equalsIgnoreCase(serverConfig.getTransportType())) {
                // Use direct HTTP client for tools listing
                McpHttpService.ToolsListResult toolsResult = mcpHttpService.listTools(serverConfig.getUrl());
                if (!toolsResult.isSuccess()) {
                    logger.warn("Failed to list tools from HTTP MCP server: {}", toolsResult.getError());
                    tools = new ArrayList<>();
                } else {
                    tools = toolsResult.getTools().stream()
                        .map(t -> {
                            McpSessionClient.ToolInfo toolInfo = new McpSessionClient.ToolInfo();
                            toolInfo.setName(t.getName());
                            toolInfo.setDescription(t.getDescription());
                            try {
                                toolInfo.setParameters(objectMapper.writeValueAsString(t.getInputSchema()));
                            } catch (Exception e) {
                                logger.warn("Failed to serialize tool parameters for {}: {}", t.getName(), e.getMessage());
                                toolInfo.setParameters("{}");
                            }
                            return toolInfo;
                        })
                        .toList();
                }
                logger.info("Listed {} tools from HTTP MCP server '{}'", tools.size(), serverConfig.getName());
            } else {
                // Use session client for stdio transport
                String toolsUrl = null;
                tools = sessionClient.listTools(serverConfig.getId().toString(), toolsUrl);
            }
            
            // Cache tools for fast lookup
            toolCache.put(serverConfig.getId(), tools);
            
            logger.info("Successfully connected to MCP server '{}' with {} tools", 
                    serverConfig.getName(), tools.size());
            
            List<ToolInfo> toolInfos = tools.stream()
                .map(t -> {
                    ToolInfo info = new ToolInfo();
                    info.setName(t.getName());
                    info.setDescription(t.getDescription());
                    info.setParameters(t.getParameters());
                    return info;
                })
                .toList();
            
            return new ConnectionResult(true, "Connected to " + serverConfig.getName(), toolInfos);
            
        } catch (Exception e) {
            logger.error("Failed to connect to MCP server {}: {}", serverConfig.getName(), e.getMessage(), e);
            connectionStates.put(serverConfig.getId(), ConnectionStatus.ERROR);
            
            // Clean up stdio process on failure
            if ("STDIO".equalsIgnoreCase(serverConfig.getTransportType()) && stdioTransport != null) {
                stdioTransport.stopServer(serverConfig.getId());
            }
            
            String errorMsg = formatErrorMessageForController(e);
            return new ConnectionResult(false, errorMsg, List.of());
        }
    }

    public boolean disconnectFromServer(Long serverId) {
        return disconnect(serverId);
    }

    public boolean disconnect(Long serverId) {
        logger.info("Disconnecting from MCP server (id={})", serverId);
        
        try {
            // Stop stdio process if running
            if (stdioTransport != null) {
                stdioTransport.stopServer(serverId);
            }
            
            sessionClient.closeSession(serverId.toString());
            connectionStates.put(serverId, ConnectionStatus.DISCONNECTED);
            toolCache.remove(serverId);  // Clear tool cache
            
            logger.info("Successfully disconnected from MCP server {}", serverId);
            return true;
            
        } catch (Exception e) {
            logger.error("Error disconnecting from MCP server {}: {}", serverId, e.getMessage(), e);
            connectionStates.put(serverId, ConnectionStatus.ERROR);
            return false;
        }
    }

    public List<ToolInfo> listTools(Long serverId) {
        McpServerConfig serverConfig = serverRepository.findById(serverId)
                .orElseThrow(() -> new IllegalStateException("MCP server not found: " + serverId));
        
        if (!isConnected(serverId)) {
            throw new IllegalStateException("Not connected to MCP server: " + serverId);
        }
        
        List<McpSessionClient.ToolInfo> tools;
        if ("HTTP".equalsIgnoreCase(serverConfig.getTransportType())) {
            // Use mcpHttpService for listing tools (handles Accept headers correctly)
            McpHttpService.ToolsListResult toolsResult = mcpHttpService.listTools(serverConfig.getUrl());
            if (!toolsResult.isSuccess()) {
                logger.warn("Failed to list tools from HTTP server {}: {}", serverConfig.getName(), toolsResult.getError());
                return new ArrayList<>();
            }
            tools = toolsResult.getTools().stream()
                .map(t -> {
                    McpSessionClient.ToolInfo toolInfo = new McpSessionClient.ToolInfo();
                    toolInfo.setName(t.getName());
                    toolInfo.setDescription(t.getDescription());
                    try {
                        toolInfo.setParameters(objectMapper.writeValueAsString(t.getInputSchema()));
                    } catch (Exception e) {
                        logger.warn("Failed to serialize tool parameters for {}: {}", t.getName(), e.getMessage());
                        toolInfo.setParameters("{}");
                    }
                    return toolInfo;
                })
                .toList();
            logger.info("Listed {} tools from HTTP server {}", tools.size(), serverConfig.getName());
        } else {
            // Use session client for stdio transport
            String toolsUrl = null;
            tools = sessionClient.listTools(serverId.toString(), toolsUrl);
        }
        
        return tools.stream()
            .map(t -> {
                ToolInfo info = new ToolInfo();
                info.setName(t.getName());
                info.setDescription(t.getDescription());
                info.setParameters(t.getParameters());
                return info;
            })
            .toList();
    }

    public ToolCallResult callTool(Long serverId, String toolName, Map<String, Object> arguments) {
        McpServerConfig serverConfig = serverRepository.findById(serverId)
                .orElseThrow(() -> new IllegalStateException("MCP server not found: " + serverId));
        
        if (!isConnected(serverId)) {
            return new ToolCallResult(false, "Not connected to server " + serverId, null);
        }
        
        logger.info(">>> MCP TOOL CALL [{}] on server {} (id={})", toolName, serverConfig.getName(), serverId);
        logger.debug("Tool arguments: {}", arguments);
        
        try {
            if ("HTTP".equalsIgnoreCase(serverConfig.getTransportType())) {
                // Use mcpHttpService for tool calls - execute in new thread to avoid blocking reactor
                final java.util.concurrent.atomic.AtomicReference<McpHttpService.ToolCallResult> resultRef = 
                    new java.util.concurrent.atomic.AtomicReference<>();
                final java.util.concurrent.atomic.AtomicReference<Exception> errorRef = 
                    new java.util.concurrent.atomic.AtomicReference<>();
                
                Thread thread = new Thread(() -> {
                    try {
                        resultRef.set(mcpHttpService.callTool(serverConfig.getUrl(), toolName, arguments));
                    } catch (Exception e) {
                        errorRef.set(e);
                    }
                });
                thread.start();
                thread.join(30000);
                
                if (errorRef.get() != null) {
                    throw errorRef.get();
                }
                
                McpHttpService.ToolCallResult result = resultRef.get();
                
                logger.info("<<< MCP TOOL RESULT [{}] - success={}, contentLength={}", 
                    toolName, result.isSuccess(), result.getContent() != null ? result.getContent().length() : 0);
                logger.debug("Tool result content: {}", result.getContent());
                
                return new ToolCallResult(result.isSuccess(), result.getContent(), null);
            } else {
                // Use session client for stdio transport
                String toolsUrl = null;
                McpSessionClient.ToolCallResult result = sessionClient.callTool(
                    serverId.toString(),
                    toolsUrl,
                    toolName,
                    arguments
                );
                
                logger.info("<<< MCP TOOL RESULT [{}] - success={}, contentLength={}", 
                    toolName, result.isSuccess(), result.getContent() != null ? result.getContent().length() : 0);
                logger.debug("Tool result content: {}", result.getContent());
                
                return new ToolCallResult(result.isSuccess(), result.getContent(), null);
            }
        } catch (Exception e) {
            logger.error("Tool call failed: {}", toolName, e);
            return new ToolCallResult(false, "Tool call failed: " + e.getMessage(), null);
        }
    }

    public ToolCallResult callTool(String toolName, Map<String, Object> arguments) {
        // Search for tool in cached tool lists (fast, no HTTP calls)
        for (Map.Entry<Long, ConnectionStatus> entry : connectionStates.entrySet()) {
            if (entry.getValue() == ConnectionStatus.CONNECTED) {
                Long serverId = entry.getKey();
                McpServerConfig config = serverRepository.findById(serverId).orElse(null);
                if (config == null) {
                    continue;
                }
                
                // Check cache for this tool
                List<McpSessionClient.ToolInfo> cachedTools = toolCache.get(serverId);
                if (cachedTools != null) {
                    boolean hasTool = cachedTools.stream().anyMatch(t -> t.getName().equals(toolName));
                    if (hasTool) {
                        logger.info("Found tool [{}] in cache on server [{}] (id={})", toolName, config.getName(), serverId);
                        return callTool(serverId, toolName, arguments);
                    }
                }
            }
        }
        
        logger.warn("Tool [{}] not found on any connected MCP server", toolName);
        return new ToolCallResult(false, "Tool '" + toolName + "' not found on any connected server", null);
    }

    public boolean isConnected(Long serverId) {
        ConnectionStatus status = connectionStates.get(serverId);
        return status == ConnectionStatus.CONNECTED;
    }

    public ConnectionStatus getConnectionStatus(Long serverId) {
        return connectionStates.getOrDefault(serverId, ConnectionStatus.DISCONNECTED);
    }

    public Long getFirstConnectedServerId() {
        for (Map.Entry<Long, ConnectionStatus> entry : connectionStates.entrySet()) {
            if (entry.getValue() == ConnectionStatus.CONNECTED) {
                return entry.getKey();
            }
        }
        return null;
    }

    public List<Map<String, Object>> getToolDefinitionsForAI() {
        List<Map<String, Object>> allTools = new ArrayList<>();
        int serverCount = 0;
        
        logger.info("getToolDefinitionsForAI: checking {} servers in connectionStates", connectionStates.size());
        
        // Collect tools from ALL connected servers
        for (Map.Entry<Long, ConnectionStatus> entry : connectionStates.entrySet()) {
            logger.info("getToolDefinitionsForAI: server {} status={}", entry.getKey(), entry.getValue());
            if (entry.getValue() == ConnectionStatus.CONNECTED) {
                serverCount++;
                Long serverId = entry.getKey();
                McpServerConfig config = serverRepository.findById(serverId).orElse(null);
                if (config == null) {
                    logger.warn("getToolDefinitionsForAI: config not found for server {}", serverId);
                    continue;
                }
                
                logger.info("getToolDefinitionsForAI: processing HTTP server {} with URL {}", config.getName(), config.getUrl());
                
                List<McpSessionClient.ToolInfo> tools;
                if ("HTTP".equalsIgnoreCase(config.getTransportType())) {
                    // Use direct HTTP client for HTTP transport
                    McpHttpService.ToolsListResult toolsResult = mcpHttpService.listTools(config.getUrl());
                    if (!toolsResult.isSuccess()) {
                        logger.warn("Failed to list tools from HTTP server {}: {}", config.getName(), toolsResult.getError());
                        continue;
                    }
                    tools = toolsResult.getTools().stream()
                        .map(t -> {
                            McpSessionClient.ToolInfo toolInfo = new McpSessionClient.ToolInfo();
                            toolInfo.setName(t.getName());
                            toolInfo.setDescription(t.getDescription());
                            try {
                                toolInfo.setParameters(objectMapper.writeValueAsString(t.getInputSchema()));
                            } catch (Exception e) {
                                logger.warn("Failed to serialize tool parameters for {}: {}", t.getName(), e.getMessage());
                                toolInfo.setParameters("{}");
                            }
                            return toolInfo;
                        })
                        .toList();
                    logger.info("Collected {} tools from HTTP server [{}] (id={})", tools.size(), config.getName(), serverId);
                } else {
                    // Use session client for stdio transport
                    String toolsUrl = null;
                    tools = sessionClient.listTools(serverId.toString(), toolsUrl);
                    logger.info("Collecting {} tools from server [{}] (id={})", tools.size(), config.getName(), serverId);
                }
                
                for (McpSessionClient.ToolInfo tool : tools) {
                    Map<String, Object> aiTool = new HashMap<>();
                    aiTool.put("type", "function");
                    
                    Map<String, Object> function = new HashMap<>();
                    function.put("name", tool.getName());
                    function.put("description", tool.getDescription());
                    
                    try {
                        Map<String, Object> schema = objectMapper.readValue(tool.getParameters(), Map.class);
                        function.put("parameters", schema);
                        logger.debug("Added tool [{}] from server [{}] (id={})", 
                            tool.getName(), config.getName(), serverId);
                    } catch (Exception e) {
                        logger.warn("Failed to parse schema for tool {}: {}", tool.getName(), e.getMessage());
                        Map<String, Object> emptySchema = new HashMap<>();
                        emptySchema.put("type", "object");
                        emptySchema.put("properties", new HashMap<>());
                        function.put("parameters", emptySchema);
                    }
                    
                    aiTool.put("function", function);
                    allTools.add(aiTool);
                }
            }
        }
        
        logger.info("Collected {} tools from {} connected MCP servers", 
            allTools.size(), serverCount);
        
        return allTools;
    }

    public String formatErrorMessageForController(Exception e) {
        String message = e.getMessage();
        if (message == null) {
            return "Unknown error";
        }
        if (message.contains("Connection refused") || message.contains("connect failed")) {
            return "Connection refused - MCP server may not be running";
        }
        if (message.contains("timeout") || message.contains("Timeout")) {
            return "Connection timeout - MCP server not responding";
        }
        if (message.contains("404")) {
            return "MCP endpoint not found - check URL path";
        }
        if (message.contains("400")) {
            return "Bad request - MCP protocol mismatch";
        }
        return message;
    }

    public enum ConnectionStatus {
        DISCONNECTED,
        CONNECTING,
        CONNECTED,
        ERROR
    }

    public static class ConnectionResult {
        private final boolean success;
        private final String message;
        private final List<ToolInfo> tools;

        public ConnectionResult(boolean success, String message, List<ToolInfo> tools) {
            this.success = success;
            this.message = message;
            this.tools = tools;
        }

        public boolean isSuccess() { return success; }
        public String getMessage() { return message; }
        public List<ToolInfo> getTools() { return tools; }
    }

    public static class ToolInfo {
        private String name;
        private String description;
        private String parameters;

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
        public String getParameters() { return parameters; }
        public void setParameters(String parameters) { this.parameters = parameters; }
    }

    public static class ToolCallResult {
        private final boolean success;
        private final String content;
        private final Map<String, Object> rawResult;

        public ToolCallResult(boolean success, String content, Map<String, Object> rawResult) {
            this.success = success;
            this.content = content;
            this.rawResult = rawResult;
        }

        public boolean isSuccess() { return success; }
        public String getContent() { return content; }
        public Map<String, Object> getRawResult() { return rawResult; }
    }
}
