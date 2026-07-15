package com.aichat.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import io.modelcontextprotocol.client.McpClient;
import io.modelcontextprotocol.client.McpSyncClient;
import io.modelcontextprotocol.client.transport.HttpClientStreamableHttpTransport;
import io.modelcontextprotocol.client.transport.ServerParameters;
import io.modelcontextprotocol.client.transport.StdioClientTransport;
import io.modelcontextprotocol.spec.McpSchema;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import reactor.core.publisher.Mono;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * MCP client with full session protocol support.
 * Implements MCP specification with SSE transport and session management.
 */
@Component
public class McpSessionClient {

    private static final Logger logger = LoggerFactory.getLogger(McpSessionClient.class);
    private final ObjectMapper objectMapper = new ObjectMapper()
            .disable(SerializationFeature.FAIL_ON_EMPTY_BEANS);
    private final WebClient webClient;

    private final ConcurrentHashMap<String, McpSyncClient> clients = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, HttpClientStreamableHttpTransport> httpTransports = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, StdioClientTransport> stdioTransports = new ConcurrentHashMap<>();
    private final ExecutorService executor = Executors.newCachedThreadPool();
    
    @Autowired(required = false)
    private StdioMcpTransport stdioTransport;

    public McpSessionClient() {
        this.webClient = WebClient.builder()
                .clientConnector(new ReactorClientHttpConnector(
                        HttpClient.create().responseTimeout(Duration.ofSeconds(10))
                ))
                .build();
    }

    public SessionInfo initialize(String serverId, String baseUrl, String transportType) {
        if ("STDIO".equalsIgnoreCase(transportType)) {
            return initializeStdio(serverId);
        } else {
            return initializeHttp(serverId, baseUrl);
        }
    }
    
    public SessionInfo initialize(String serverId, String baseUrl) {
        // Default to HTTP for backward compatibility
        return initializeHttp(serverId, baseUrl);
    }
    
    private SessionInfo initializeStdio(String serverId) {
        logger.info(">>> MCP REQUEST [initialize] to stdio server {}", serverId);
        
        try {
            if (stdioTransport == null) {
                logger.error("StdioTransport not available");
                return new SessionInfo(false, null, "Stdio transport not available");
            }
            
            StdioClientTransport transport = stdioTransport.getTransport(Long.parseLong(serverId));
            if (transport == null) {
                logger.error("Stdio transport not found for server {}", serverId);
                return new SessionInfo(false, null, "Stdio transport not found");
            }
            
            McpSyncClient client = McpClient.sync(transport).build();
            client.initialize();
            
            logger.info("<<< MCP RESPONSE [initialize] from stdio server {} - SUCCESS", serverId);
            
            clients.put(serverId, client);
            stdioTransports.put(serverId, transport);
            
            return new SessionInfo(true, serverId, "Connected");
            
        } catch (Exception e) {
            logger.error("<<< MCP RESPONSE [initialize] from stdio server {} - ERROR: {}", serverId, e.getMessage());
            return new SessionInfo(false, null, "Error: " + e.getMessage());
        }
    }
    
    private SessionInfo initializeHttp(String serverId, String baseUrl) {
        logger.info(">>> MCP REQUEST [initialize] to server {} at {}", serverId, baseUrl);
        logger.debug("Initialize request: protocolVersion=2024-11-05, capabilities={{}}, clientInfo={name=test, version=1.0}");
        
        try {
            String normalizedUrl = ensureTrailingSlash(baseUrl);
            
            HttpClientStreamableHttpTransport transport = HttpClientStreamableHttpTransport.builder(normalizedUrl)
                    .build();
            
            McpSyncClient client = McpClient.sync(transport)
                    .build();
            
            client.initialize();
            logger.info("<<< MCP RESPONSE [initialize] from server {} - SUCCESS", serverId);
            logger.info("MCP client initialized successfully");
            
            clients.put(serverId, client);
            httpTransports.put(serverId, transport);
            
            return new SessionInfo(true, serverId, "Connected");
            
        } catch (Exception e) {
            logger.error("<<< MCP RESPONSE [initialize] from server {} - ERROR: {}", serverId, e.getMessage());
            logger.error("Failed to initialize MCP session: {}", e.getMessage(), e);
            return new SessionInfo(false, null, "Error: " + e.getMessage());
        }
    }

    private String connectToSse(String baseUrl) {
        try {
            String sseUrl = ensureTrailingSlash(baseUrl) + "sse";
            
            logger.debug("Attempting SSE connection to {}", sseUrl);
            
            String sseResponse = webClient.get()
                    .uri(sseUrl)
                    .header("Accept", "text/event-stream")
                    .retrieve()
                    .bodyToMono(String.class)
                    .timeout(Duration.ofSeconds(5))
                    .onErrorResume(e -> {
                        logger.debug("SSE connection failed: {}", e.getMessage());
                        return Mono.just("");
                    })
                    .block();
            
            if (sseResponse != null && !sseResponse.isEmpty()) {
                logger.debug("SSE response preview: {}", sseResponse.substring(0, Math.min(200, sseResponse.length())));
                
                String[] lines = sseResponse.split("\n");
                for (String line : lines) {
                    if (line.startsWith("data:")) {
                        String endpointUrl = line.substring(5).trim();
                        if (endpointUrl.contains("/")) {
                            String[] parts = endpointUrl.split("/");
                            String sessionId = parts[parts.length - 1];
                            if (!sessionId.isEmpty()) {
                                logger.info("Extracted session ID: {} from endpoint", sessionId);
                                return sessionId;
                            }
                        }
                    }
                }
            }
            
            logger.debug("No session ID found in SSE response, using stateless mode");
            return null;
            
        } catch (Exception e) {
            logger.debug("SSE connection failed, using stateless mode: {}", e.getMessage());
            return null;
        }
    }
    
    private String ensureTrailingSlash(String url) {
        return url.endsWith("/") ? url : url + "/";
    }

    /**
     * Send JSON-RPC request with session ID.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> sendJsonRpc(String baseUrl, Object request, String sessionId) {
        try {
            String json = objectMapper.writeValueAsString(request);
            logger.debug("Sending JSON-RPC: {}", json);
            
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("Accept", "application/json, text/event-stream");
            if (sessionId != null && !sessionId.startsWith("stateless")) {
                headers.set("mcp-session-id", sessionId);
            }
            
            String response = webClient.post()
                    .uri(baseUrl)
                    .headers(h -> {
                        h.addAll(headers);
                        if (sessionId != null && !sessionId.startsWith("stateless")) {
                            h.set("mcp-session-id", sessionId);
                        }
                    })
                    .bodyValue(request)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();
            
            logger.debug("Received response: {}", response);
            
            if (response == null) {
                return null;
            }
            
            return objectMapper.readValue(response, Map.class);
            
        } catch (WebClientResponseException e) {
            logger.error("HTTP error: {} - {}", e.getStatusCode(), e.getResponseBodyAsString());
            return null;
        } catch (Exception e) {
            logger.error("JSON-RPC request failed: {}", e.getMessage());
            return null;
        }
    }

    /**
     * Send JSON-RPC notification (no response expected).
     */
    private void sendNotification(String baseUrl, String method, Map<String, Object> params, String sessionId) {
        try {
            Map<String, Object> notification = new HashMap<>();
            notification.put("jsonrpc", "2.0");
            notification.put("method", method);
            if (params != null) {
                notification.put("params", params);
            }
            
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            if (sessionId != null && !sessionId.startsWith("stateless")) {
                headers.set("mcp-session-id", sessionId);
            }
            
            webClient.post()
                    .uri(baseUrl)
                    .headers(h -> {
                        h.addAll(headers);
                        if (sessionId != null && !sessionId.startsWith("stateless")) {
                            h.set("mcp-session-id", sessionId);
                        }
                    })
                    .bodyValue(notification)
                    .retrieve()
                    .bodyToMono(Void.class)
                    .block();
            
            logger.debug("Notification sent: {}", method);
            
        } catch (Exception e) {
            logger.debug("Notification failed (may be expected): {}", e.getMessage());
        }
    }

    /**
     * List available tools from MCP server.
     */
    @SuppressWarnings("unchecked")
    public List<ToolInfo> listTools(String serverId, String baseUrl) {
        McpSyncClient client = clients.get(serverId);
        if (client == null) {
            logger.warn("No active client for server {}", serverId);
            return List.of();
        }
        
        try {
            logger.info(">>> MCP REQUEST [listTools] to server {} at {}", serverId, baseUrl);
            logger.debug("Request method: tools/list");
            logger.debug("Request params: {{}}");
            
            McpSchema.ListToolsResult result = client.listTools();
            List<McpSchema.Tool> tools = result.tools();
            
            logger.info("<<< MCP RESPONSE [listTools] from server {} - {} tools", serverId, tools.size());
            
            List<ToolInfo> toolInfos = new ArrayList<>();
            for (McpSchema.Tool tool : tools) {
                ToolInfo toolInfo = new ToolInfo();
                toolInfo.setName(tool.name());
                toolInfo.setDescription(tool.description() != null ? tool.description() : "");
                
                try {
                    String schemaJson = objectMapper.writeValueAsString(tool.inputSchema());
                    toolInfo.setParameters(schemaJson);
                    logger.debug("  Tool [{}]: description={}, schema={}", 
                        tool.name(), tool.description(), schemaJson);
                } catch (Exception e) {
                    logger.warn("Failed to serialize schema for {}: {}", tool.name(), e.getMessage());
                    toolInfo.setParameters("{}");
                }
                
                toolInfos.add(toolInfo);
            }
            
            logger.info("Listed {} tools from server {}", toolInfos.size(), serverId);
            return toolInfos;
            
        } catch (Exception e) {
            logger.error("Failed to list tools: {}", e.getMessage(), e);
            return List.of();
        }
    }

    public ToolCallResult callTool(String serverId, String baseUrl, String toolName, Map<String, Object> arguments) {
        McpSyncClient client = clients.get(serverId);
        if (client == null) {
            logger.warn("No active client for server {}", serverId);
            return new ToolCallResult(false, "No active session", null);
        }
        
        try {
            String argsJson = objectMapper.writeValueAsString(arguments);
            logger.info(">>> MCP REQUEST [callTool] to server {} at {}", serverId, baseUrl);
            logger.debug("Request method: tools/call");
            logger.debug("Request tool name: {}", toolName);
            logger.debug("Request arguments: {}", argsJson);
            
            McpSchema.CallToolRequest request = new McpSchema.CallToolRequest(toolName, arguments);
            // Execute in separate thread to avoid blocking reactor thread
            Future<McpSchema.CallToolResult> future = executor.submit(() -> client.callTool(request));
            McpSchema.CallToolResult result = future.get(30, TimeUnit.SECONDS);
            
            String content = extractContentFromResult(result);
            boolean isError = result.isError();
            
            logger.info("<<< MCP RESPONSE [callTool] from server {} - tool={}, success={}, contentLength={}", 
                serverId, toolName, !isError, content.length());
            logger.debug("Response content: {}", content);
            if (isError) {
                logger.warn("Tool returned error: {}", content);
            }
            
            if (isError) {
                return new ToolCallResult(false, content, null);
            }
            
            return new ToolCallResult(true, content, null);
            
        } catch (TimeoutException e) {
            logger.error("Tool call timeout: {}", toolName, e);
            return new ToolCallResult(false, "Error: Tool call timeout", null);
        } catch (Exception e) {
            logger.error("Tool call failed: {}", toolName, e.getMessage(), e);
            return new ToolCallResult(false, "Error: " + e.getMessage(), null);
        }
    }
    
    private String extractContentFromResult(McpSchema.CallToolResult result) {
        List<McpSchema.Content> content = result.content();
        if (content != null && !content.isEmpty()) {
            McpSchema.Content first = content.get(0);
            if (first instanceof McpSchema.TextContent) {
                return ((McpSchema.TextContent) first).text();
            }
            return first.toString();
        }
        return result.toString();
    }

    /**
     * Close session and clean up.
     */
    public void closeSession(String serverId) {
        McpSyncClient client = clients.remove(serverId);
        if (client != null) {
            try {
                client.closeGracefully();
                logger.info("Closed MCP session for server {}", serverId);
            } catch (Exception e) {
                logger.warn("Error closing session: {}", e.getMessage());
            }
        }
        httpTransports.remove(serverId);
        stdioTransports.remove(serverId);
    }

    public boolean isConnected(String serverId) {
        return clients.containsKey(serverId);
    }

    // Request/Response DTOs
    
    static class InitializeRequest {
        public String jsonrpc;
        public Integer id;
        public String method;
        public InitializeParams params;
    }
    
    static class InitializeParams {
        public String protocolVersion;
        public Map<String, Object> capabilities;
        public ClientInfo clientInfo;
    }
    
    static class ClientInfo {
        public String name;
        public String version;
        
        public ClientInfo(String name, String version) {
            this.name = name;
            this.version = version;
        }
    }
    
    static class ToolsListRequest {
        public String jsonrpc;
        public Integer id;
        public String method;
        public ToolsListParams params;
    }
    
    @JsonIgnoreProperties(ignoreUnknown = true)
    static class ToolsListParams {
        // Empty for now
    }
    
    static class ToolCallRequest {
        public String jsonrpc;
        public Integer id;
        public String method;
        public ToolCallParams params;
        
        public ToolCallRequest() {}
        
        public ToolCallRequest(String method, String toolName, Map<String, Object> arguments) {
            this.jsonrpc = "2.0";
            this.id = 3;
            this.method = method;
            this.params = new ToolCallParams(toolName, arguments);
        }
    }
    
    @JsonIgnoreProperties(ignoreUnknown = true)
    static class ToolCallParams {
        public String name;
        public Map<String, Object> arguments;
        
        public ToolCallParams(String name, Map<String, Object> arguments) {
            this.name = name;
            this.arguments = arguments;
        }
    }

    public static class SessionInfo {
        private final boolean connected;
        private final String sessionId;
        private final String message;
        
        public SessionInfo(boolean connected, String sessionId, String message) {
            this.connected = connected;
            this.sessionId = sessionId;
            this.message = message;
        }
        
        public boolean isConnected() { return connected; }
        public String getSessionId() { return sessionId; }
        public String getMessage() { return message; }
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
