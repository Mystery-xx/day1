package com.aichat.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Direct HTTP client for MCP (Model Context Protocol) servers.
 * Implements JSON-RPC 2.0 protocol for MCP communication without Spring AI MCP SDK.
 * 
 * MCP Protocol endpoints:
 * - POST /initialize - Initialize connection with server
 * - POST /tools/list - List available tools
 * - POST /tools/call - Call a specific tool with arguments
 * 
 * JSON-RPC 2.0 format:
 * {
 *   "jsonrpc": "2.0",
 *   "id": 1,
 *   "method": "tools/list",
 *   "params": {}
 * }
 */
@Service
public class McpHttpService {

    private static final Logger logger = LoggerFactory.getLogger(McpHttpService.class);

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ExecutorService executor = Executors.newCachedThreadPool();

    /**
     * Initialize connection with MCP server.
     * 
     * @param baseUrl MCP server base URL
     * @return InitializeResult with server info and capabilities
     */
    public InitializeResult initialize(String baseUrl) {
        logger.debug("Initializing MCP connection to {}", baseUrl);
        
        try {
            WebClient webClient = WebClient.builder()
                    .baseUrl(baseUrl)
                    .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                    .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE, "application/event-stream")
                    .build();

            Map<String, Object> request = buildJsonRpcRequest("initialize", Map.of(
                "protocolVersion", "2024-11-05",
                "capabilities", Map.of(),
                "clientInfo", Map.of(
                    "name", "ai-chat-backend",
                    "version", "1.0.0"
                )
            ));

            JsonNode response = webClient.post()
                    .bodyValue(request)
                    .retrieve()
                    .bodyToMono(JsonNode.class)
                    .block();

            if (response.has("error")) {
                String errorMsg = response.get("error").toString();
                logger.error("MCP initialize error: {}", errorMsg);
                return new InitializeResult(false, "Initialize failed: " + errorMsg, null);
            }

            JsonNode result = response.get("result");
            if (result == null) {
                return new InitializeResult(false, "No result in initialize response", null);
            }

            JsonNode serverInfo = result.get("serverInfo");
            String serverName = serverInfo != null && serverInfo.has("name") 
                ? serverInfo.get("name").asText() 
                : "Unknown";

            logger.info("MCP server initialized: {}", serverName);
            return new InitializeResult(true, "Connected to " + serverName, serverName);

        } catch (Exception e) {
            logger.error("Failed to initialize MCP server: {}", e.getMessage());
            return new InitializeResult(false, "Initialize failed: " + e.getMessage(), null);
        }
    }

    /**
     * List available tools from MCP server.
     * 
     * @param baseUrl MCP server base URL
     * @return List of tool definitions
     */
    public ToolsListResult listTools(String baseUrl) {
        logger.debug("Listing tools from MCP server {}", baseUrl);
        
        try {
            WebClient webClient = WebClient.builder()
                    .baseUrl(baseUrl)
                    .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                    .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
                    .build();

            Map<String, Object> request = buildJsonRpcRequest("tools/list", Map.of());

            JsonNode response = webClient.post()
                    .bodyValue(request)
                    .retrieve()
                    .bodyToMono(JsonNode.class)
                    .block();

            if (response.has("error")) {
                String errorMsg = response.get("error").toString();
                logger.error("MCP tools/list error: {}", errorMsg);
                return new ToolsListResult(false, "Failed to list tools: " + errorMsg, Collections.emptyList());
            }

            JsonNode result = response.get("result");
            if (result == null || !result.has("tools")) {
                return new ToolsListResult(false, "No tools in response", Collections.emptyList());
            }

            JsonNode toolsNode = result.get("tools");
            List<ToolDefinition> tools = new ArrayList<>();

            for (JsonNode toolNode : toolsNode) {
                ToolDefinition tool = parseToolDefinition(toolNode);
                if (tool != null) {
                    tools.add(tool);
                }
            }

            logger.info("Listed {} tools from MCP server", tools.size());
            return new ToolsListResult(true, null, tools);

        } catch (Exception e) {
            logger.error("Failed to list tools: {}", e.getMessage());
            return new ToolsListResult(false, "Failed to list tools: " + e.getMessage(), Collections.emptyList());
        }
    }

    /**
     * Call a tool on MCP server with specified arguments.
     * 
     * @param baseUrl MCP server base URL
     * @param toolName Name of the tool to call
     * @param arguments Tool arguments as JSON map
     * @return ToolCallResult with tool output or error
     */
    public ToolCallResult callTool(String baseUrl, String toolName, Map<String, Object> arguments) {
        logger.debug("Calling tool {} on MCP server {}", toolName, baseUrl);
        
        try {
            WebClient webClient = WebClient.builder()
                    .baseUrl(baseUrl)
                    .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                    .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
                    .build();

            Map<String, Object> params = new HashMap<>();
            params.put("name", toolName);
            params.put("arguments", arguments);

            Map<String, Object> request = buildJsonRpcRequest("tools/call", params);

            JsonNode response = webClient.post()
                    .bodyValue(request)
                    .retrieve()
                    .bodyToMono(JsonNode.class)
                    .block();

            if (response.has("error")) {
                JsonNode error = response.get("error");
                String errorMsg = error.has("message") ? error.get("message").asText() : error.toString();
                int errorCode = error.has("code") ? error.get("code").asInt() : -1;
                logger.error("MCP tools/call error: {} (code: {})", errorMsg, errorCode);
                return new ToolCallResult(false, "Tool error: " + errorMsg, null, errorCode);
            }

            JsonNode result = response.get("result");
            if (result == null) {
                return new ToolCallResult(false, "No result in tool response", null, null);
            }

            // Extract tool output - MCP returns {content: [...], isError: false}
            String content = extractToolContent(result);
            boolean isError = result.has("isError") && result.get("isError").asBoolean();

            if (isError) {
                return new ToolCallResult(false, content, null, -1);
            }

            logger.info("Tool {} executed successfully", toolName);
            return new ToolCallResult(true, content, result, null);

        } catch (WebClientResponseException e) {
            logger.error("HTTP error calling tool {}: {}", toolName, e.getMessage());
            return new ToolCallResult(false, "HTTP error: " + e.getStatusCode(), null, e.getRawStatusCode());
        } catch (Exception e) {
            logger.error("Failed to call tool {}: {}", toolName, e.getMessage());
            return new ToolCallResult(false, "Tool call failed: " + e.getMessage(), null, null);
        }
    }

    /**
     * Build JSON-RPC 2.0 request object.
     */
    private Map<String, Object> buildJsonRpcRequest(String method, Map<String, Object> params) {
        Map<String, Object> request = new HashMap<>();
        request.put("jsonrpc", "2.0");
        request.put("id", System.currentTimeMillis());
        request.put("method", method);
        request.put("params", params);
        return request;
    }

    /**
     * Parse tool definition from JSON-RPC response.
     */
    private ToolDefinition parseToolDefinition(JsonNode toolNode) {
        try {
            String name = toolNode.get("name").asText();
            String description = toolNode.has("description") ? toolNode.get("description").asText() : "";
            
            // Extract input schema
            Map<String, Object> inputSchema = new HashMap<>();
            if (toolNode.has("inputSchema")) {
                JsonNode schemaNode = toolNode.get("inputSchema");
                inputSchema.put("type", schemaNode.has("type") ? schemaNode.get("type").asText() : "object");
                
                if (schemaNode.has("properties")) {
                    inputSchema.put("properties", objectMapper.treeToValue(schemaNode.get("properties"), Map.class));
                }
                
                if (schemaNode.has("required")) {
                    List<String> required = new ArrayList<>();
                    for (JsonNode req : schemaNode.get("required")) {
                        required.add(req.asText());
                    }
                    inputSchema.put("required", required);
                }
            }

            return new ToolDefinition(name, description, inputSchema);
        } catch (Exception e) {
            logger.error("Failed to parse tool definition: {}", e.getMessage());
            return null;
        }
    }

    /**
     * Extract text content from tool result.
     * MCP returns content as array of {type: "text", text: "..."} objects.
     */
    private String extractToolContent(JsonNode result) {
        if (result.has("content")) {
            JsonNode contentNode = result.get("content");
            if (contentNode.isArray() && contentNode.size() > 0) {
                StringBuilder sb = new StringBuilder();
                for (JsonNode item : contentNode) {
                    if (item.has("type") && "text".equals(item.get("type").asText())) {
                        if (item.has("text")) {
                            sb.append(item.get("text").asText());
                        }
                    } else if (item.has("text")) {
                        sb.append(item.get("text").asText());
                    }
                }
                return sb.toString().trim();
            }
        }
        
        // Fallback: convert entire result to string
        return result.toString();
    }

    // === Result Classes ===

    public static class InitializeResult {
        private final boolean success;
        private final String message;
        private final String serverName;

        public InitializeResult(boolean success, String message, String serverName) {
            this.success = success;
            this.message = message;
            this.serverName = serverName;
        }

        public boolean isSuccess() { return success; }
        public String getMessage() { return message; }
        public String getServerName() { return serverName; }
    }

    public static class ToolsListResult {
        private final boolean success;
        private final String error;
        private final List<ToolDefinition> tools;

        public ToolsListResult(boolean success, String error, List<ToolDefinition> tools) {
            this.success = success;
            this.error = error;
            this.tools = tools;
        }

        public boolean isSuccess() { return success; }
        public String getError() { return error; }
        public List<ToolDefinition> getTools() { return tools; }
    }

    public static class ToolDefinition {
        private final String name;
        private final String description;
        private final Map<String, Object> inputSchema;

        public ToolDefinition(String name, String description, Map<String, Object> inputSchema) {
            this.name = name;
            this.description = description;
            this.inputSchema = inputSchema;
        }

        public String getName() { return name; }
        public String getDescription() { return description; }
        public Map<String, Object> getInputSchema() { return inputSchema; }
    }

    public static class ToolCallResult {
        private final boolean success;
        private final String content;
        private final JsonNode rawResult;
        private final Integer errorCode;

        public ToolCallResult(boolean success, String content, JsonNode rawResult, Integer errorCode) {
            this.success = success;
            this.content = content;
            this.rawResult = rawResult;
            this.errorCode = errorCode;
        }

        public boolean isSuccess() { return success; }
        public String getContent() { return content; }
        public JsonNode getRawResult() { return rawResult; }
        public Integer getErrorCode() { return errorCode; }
    }
}
