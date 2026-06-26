package com.aichat.service;

import com.aichat.dto.ToolEvent;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.mcp.SyncMcpToolCallbackProvider;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.stereotype.Service;
import reactor.core.publisher.FluxSink;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;

/**
 * Service to emit tool execution events during SSE streaming.
 * Wraps SyncMcpToolCallbackProvider to intercept tool calls.
 */
@Service
public class ToolEventEmitter {

    private static final Logger logger = LoggerFactory.getLogger(ToolEventEmitter.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    
    // Store active emitters per session
    private final ConcurrentHashMap<String, List<Consumer<ToolEvent>>> sessionEmitters = new ConcurrentHashMap<>();

    /**
     * Register an emitter for a session.
     */
    public void registerEmitter(String sessionId, Consumer<ToolEvent> emitter) {
        sessionEmitters.computeIfAbsent(sessionId, k -> new ArrayList<>()).add(emitter);
    }

    /**
     * Unregister emitter when session ends.
     */
    public void unregisterEmitter(String sessionId, Consumer<ToolEvent> emitter) {
        List<Consumer<ToolEvent>> emitters = sessionEmitters.get(sessionId);
        if (emitters != null) {
            emitters.remove(emitter);
            if (emitters.isEmpty()) {
                sessionEmitters.remove(sessionId);
            }
        }
    }

    /**
     * Emit a tool event to all registered emitters for a session.
     */
    public void emitEvent(String sessionId, ToolEvent event) {
        List<Consumer<ToolEvent>> emitters = sessionEmitters.get(sessionId);
        if (emitters != null) {
            emitters.forEach(emitter -> {
                try {
                    emitter.accept(event);
                } catch (Exception e) {
                    logger.error("Error emitting tool event", e);
                }
            });
        }
    }

    /**
     * Emit tool call event.
     */
    public void emitToolCall(String sessionId, String toolName, String toolId, Map<String, Object> arguments) {
        logger.info("Emitting toolCall event: {} (sessionId={})", toolName, sessionId);
        ToolEvent event = ToolEvent.toolCall(toolName, toolId, arguments);
        emitEvent(sessionId, event);
    }

    /**
     * Emit tool result event.
     */
    public void emitToolResult(String sessionId, String toolName, String toolId, Object result) {
        logger.info("Emitting toolResult event: {} (sessionId={})", toolName, sessionId);
        ToolEvent event = ToolEvent.toolResult(toolName, toolId, result);
        emitEvent(sessionId, event);
    }

    /**
     * Emit tool error event.
     */
    public void emitToolError(String sessionId, String toolName, String toolId, String error) {
        logger.info("Emitting toolError event: {} - {} (sessionId={})", toolName, error, sessionId);
        ToolEvent event = ToolEvent.toolError(toolName, toolId, error);
        emitEvent(sessionId, event);
    }

    /**
     * Create an emitter that writes to a FluxSink (for SSE streaming).
     */
    public Consumer<ToolEvent> createFluxEmitter(FluxSink<String> sink) {
        return event -> {
            try {
                String json = objectMapper.writeValueAsString(Map.of(
                    "type", event.getType(),
                    "data", event
                ));
                sink.next(json);
            } catch (JsonProcessingException e) {
                logger.error("Error serializing tool event", e);
            }
        };
    }

    /**
     * Wrap a SyncMcpToolCallbackProvider to emit events.
     * Note: This requires custom implementation as Spring AI doesn't expose tool call hooks.
     */
    public SyncMcpToolCallbackProvider wrapProvider(SyncMcpToolCallbackProvider provider, String sessionId) {
        // For now, return the provider as-is
        // Future enhancement: create a wrapper that intercepts tool calls
        return provider;
    }
}
