package com.aichat.service;

import com.aichat.entity.McpServerConfig;
import com.aichat.repository.McpServerRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
    private final ObjectMapper objectMapper = new ObjectMapper();

    private final ConcurrentHashMap<Long, ConnectionStatus> connectionStates = new ConcurrentHashMap<>();

    public McpClientService(McpServerRepository serverRepository, McpSessionClient sessionClient) {
        this.serverRepository = serverRepository;
        this.sessionClient = sessionClient;
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
            
            McpSessionClient.SessionInfo sessionInfo = sessionClient.initialize(
                serverConfig.getId().toString(), 
                serverConfig.getUrl()
            );
            
            if (!sessionInfo.isConnected()) {
                logger.warn("Failed to initialize MCP server {}: {}", serverConfig.getName(), sessionInfo.getMessage());
                connectionStates.put(serverConfig.getId(), ConnectionStatus.ERROR);
                return new ConnectionResult(false, sessionInfo.getMessage(), List.of());
            }
            
            connectionStates.put(serverConfig.getId(), ConnectionStatus.CONNECTED);
            
            List<McpSessionClient.ToolInfo> tools = sessionClient.listTools(
                serverConfig.getId().toString(),
                serverConfig.getUrl()
            );
            
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
            sessionClient.closeSession(serverId.toString());
            connectionStates.put(serverId, ConnectionStatus.DISCONNECTED);
            
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
        
        List<McpSessionClient.ToolInfo> tools = sessionClient.listTools(
            serverId.toString(),
            serverConfig.getUrl()
        );
        
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
        
        McpSessionClient.ToolCallResult result = sessionClient.callTool(
            serverId.toString(),
            serverConfig.getUrl(),
            toolName,
            arguments
        );
        
        logger.info("<<< MCP TOOL RESULT [{}] - success={}, contentLength={}", 
            toolName, result.isSuccess(), result.getContent() != null ? result.getContent().length() : 0);
        logger.debug("Tool result content: {}", result.getContent());
        
        return new ToolCallResult(result.isSuccess(), result.getContent(), null);
    }

    public ToolCallResult callTool(String toolName, Map<String, Object> arguments) {
        Long serverId = getFirstConnectedServerId();
        if (serverId == null) {
            return new ToolCallResult(false, "No MCP server connected", null);
        }
        
        return callTool(serverId, toolName, arguments);
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
        Long serverId = getFirstConnectedServerId();
        if (serverId == null) {
            return List.of();
        }
        
        McpServerConfig config = serverRepository.findById(serverId).orElse(null);
        if (config == null) {
            return List.of();
        }
        
        List<McpSessionClient.ToolInfo> tools = sessionClient.listTools(
            serverId.toString(),
            config.getUrl()
        );
        
        List<Map<String, Object>> aiTools = new ArrayList<>();
        for (McpSessionClient.ToolInfo tool : tools) {
            Map<String, Object> aiTool = new HashMap<>();
            aiTool.put("type", "function");
            
            Map<String, Object> function = new HashMap<>();
            function.put("name", tool.getName());
            function.put("description", tool.getDescription());
            
            try {
                Map<String, Object> schema = objectMapper.readValue(tool.getParameters(), Map.class);
                function.put("parameters", schema);
            } catch (Exception e) {
                logger.warn("Failed to parse schema for tool {}: {}", tool.getName(), e.getMessage());
                Map<String, Object> emptySchema = new HashMap<>();
                emptySchema.put("type", "object");
                emptySchema.put("properties", new HashMap<>());
                function.put("parameters", emptySchema);
            }
            
            aiTool.put("function", function);
            aiTools.add(aiTool);
        }
        
        return aiTools;
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
