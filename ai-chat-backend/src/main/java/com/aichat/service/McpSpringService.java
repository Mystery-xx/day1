package com.aichat.service;

import io.modelcontextprotocol.client.McpClient;
import io.modelcontextprotocol.client.McpSyncClient;
import io.modelcontextprotocol.client.transport.HttpClientSseClientTransport;
import io.modelcontextprotocol.spec.McpSchema;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

@Service
public class McpSpringService {

    private static final Logger logger = LoggerFactory.getLogger(McpSpringService.class);
    private final ExecutorService executor = Executors.newCachedThreadPool();

    public ToolCallResult callTool(String baseUrl, String toolName, Map<String, Object> arguments) {
        logger.info("Calling tool '{}' via Spring AI SDK on {}", toolName, baseUrl);
        
        Future<ToolCallResult> future = executor.submit(() -> {
            try {
                HttpClientSseClientTransport transport = HttpClientSseClientTransport.builder(baseUrl).build();
                McpSyncClient client = McpClient.sync(transport).build();
                
                try {
                    client.initialize();
                    
                    McpSchema.CallToolRequest request = new McpSchema.CallToolRequest(toolName, arguments);
                    McpSchema.CallToolResult result = client.callTool(request);
                    
                    String content = extractContent(result);
                    boolean isError = result.isError();
                    
                    if (isError) {
                        logger.error("Tool '{}' returned error: {}", toolName, content);
                        return new ToolCallResult(false, content, null);
                    }
                    
                    logger.info("Tool '{}' executed successfully", toolName);
                    return new ToolCallResult(true, content, null);
                    
                } finally {
                    client.close();
                }
                
            } catch (Exception e) {
                logger.error("Error calling tool '{}': {}", toolName, e.getMessage());
                return new ToolCallResult(false, "Error: " + e.getMessage(), null);
            }
        });
        
        try {
            return future.get(30, java.util.concurrent.TimeUnit.SECONDS);
        } catch (Exception e) {
            logger.error("Tool call timeout or error: {}", e.getMessage());
            return new ToolCallResult(false, "Timeout: " + e.getMessage(), null);
        }
    }
    
    private String extractContent(McpSchema.CallToolResult result) {
        if (result.content() != null && !result.content().isEmpty()) {
            McpSchema.Content content = result.content().get(0);
            if (content instanceof McpSchema.TextContent) {
                return ((McpSchema.TextContent) content).text();
            }
        }
        return result.toString();
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
