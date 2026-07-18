package com.aichat.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import io.modelcontextprotocol.client.transport.ServerParameters;
import io.modelcontextprotocol.client.transport.StdioClientTransport;
import io.modelcontextprotocol.json.jackson.JacksonMcpJsonMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.concurrent.ConcurrentHashMap;

@Service
public class StdioMcpTransport {
    private static final Logger logger = LoggerFactory.getLogger(StdioMcpTransport.class);
    
    private final ConcurrentHashMap<Long, StdioClientTransport> transports = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper = new ObjectMapper()
            .disable(SerializationFeature.FAIL_ON_EMPTY_BEANS);
    
    public TransportResult startServer(Long serverId, String command, String workingDirectory) {
        logger.info("Starting stdio MCP server (id={}) with command: {}", serverId, command);
        
        stopServer(serverId);
        
        try {
            String[] commandParts = command.split("\\s+");
            String cmd = commandParts[0];
            String[] args = java.util.Arrays.copyOfRange(commandParts, 1, commandParts.length);
            
            ServerParameters.Builder builder = ServerParameters.builder(cmd).args(args);
            if (workingDirectory != null && !workingDirectory.isBlank()) {
                builder.env(java.util.Map.of("PWD", workingDirectory));
            }
            
            JacksonMcpJsonMapper jsonMapper = new JacksonMcpJsonMapper(objectMapper);
            StdioClientTransport transport = new StdioClientTransport(builder.build(), jsonMapper);
            transports.put(serverId, transport);
            
            logger.info("Created stdio MCP transport (id={}) for command: {}", serverId, command);
            return new TransportResult(true, "Started successfully", null);
            
        } catch (Exception e) {
            logger.error("Failed to start stdio MCP server (id={}): {}", serverId, e.getMessage(), e);
            return new TransportResult(false, null, "Failed to start: " + e.getMessage());
        }
    }
    
    public void stopServer(Long serverId) {
        StdioClientTransport transport = transports.remove(serverId);
        if (transport != null) {
            logger.info("Removed stdio MCP transport (id={})", serverId);
        }
    }
    
    public StdioClientTransport getTransport(Long serverId) {
        return transports.get(serverId);
    }
    
    public boolean isRunning(Long serverId) {
        return transports.containsKey(serverId);
    }
    
    public record TransportResult(boolean success, String message, String error) {}
}