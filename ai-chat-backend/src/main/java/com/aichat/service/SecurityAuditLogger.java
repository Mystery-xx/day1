package com.aichat.service;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;

/**
 * Security audit logger for tracking security-related events.
 * Logs SSRF attempts, suspicious requests, and other security concerns.
 */
@Service
public class SecurityAuditLogger {

    private static final Logger logger = LoggerFactory.getLogger(SecurityAuditLogger.class);
    private static final DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /**
     * Log an SSRF (Server-Side Request Forgery) attempt.
     * 
     * @param blockedUrl the URL that was blocked
     * @param reason the reason for blocking
     * @param clientIp the client IP address
     */
    public void logSsrfAttempt(String blockedUrl, String reason, String clientIp) {
        String timestamp = LocalDateTime.now().format(formatter);
        logger.warn("[SECURITY] [SSRF_BLOCKED] [{}] Client IP: {} | Blocked URL: {} | Reason: {}",
                timestamp, clientIp, blockedUrl, reason);
    }

    /**
     * Get the client IP address from the current request context.
     * 
     * @return client IP address or "unknown" if not available
     */
    public String getClientIp() {
        try {
            ServletRequestAttributes attributes = 
                    (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attributes != null) {
                HttpServletRequest request = attributes.getRequest();
                
                // Check X-Forwarded-For header first (for proxied requests)
                String xForwardedFor = request.getHeader("X-Forwarded-For");
                if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
                    // X-Forwarded-For can contain multiple IPs: client, proxy1, proxy2, ...
                    // The first one is the original client
                    String[] ips = xForwardedFor.split(",");
                    return ips[0].trim();
                }
                
                // Check X-Real-IP header (common with nginx)
                String xRealIp = request.getHeader("X-Real-IP");
                if (xRealIp != null && !xRealIp.isEmpty()) {
                    return xRealIp;
                }
                
                // Fall back to remote address
                return request.getRemoteAddr();
            }
        } catch (Exception e) {
            logger.debug("Failed to get client IP: {}", e.getMessage());
        }
        return "unknown";
    }

    /**
     * Log a suspicious request pattern.
     * 
     * @param eventType type of suspicious event
     * @param details map of event details
     */
    public void logSuspiciousEvent(String eventType, Map<String, String> details) {
        String timestamp = LocalDateTime.now().format(formatter);
        StringBuilder detailsStr = new StringBuilder();
        details.forEach((key, value) -> detailsStr.append(key).append(value).append(", "));
        
        logger.warn("[SECURITY] [{}] [{}] Details: {}",
                timestamp, eventType, detailsStr.toString());
    }

    /**
     * Log an invalid file upload attempt.
     * 
     * @param reason the reason for rejection (e.g., "empty file", "file too large", "invalid extension")
     * @param filename the filename that was rejected (may be null)
     * @param fileSize the file size in bytes (may be 0)
     * @param clientIp the client IP address
     */
    public void logInvalidFileUpload(String reason, String filename, long fileSize, String clientIp) {
        String timestamp = LocalDateTime.now().format(formatter);
        logger.warn("[SECURITY] [INVALID_FILE_UPLOAD] [{}] Client IP: {} | Reason: {} | Filename: {} | Size: {} bytes",
                timestamp, clientIp, reason, filename != null ? filename : "unknown", fileSize);
    }

    /**
     * Log an input validation failure.
     *
     * @param reason the reason for the validation failure (e.g., "empty message", "message too long")
     * @param field the field that failed validation (may be null)
     * @param clientIp the client IP address
     */
    public void logInputValidationFailure(String reason, String field, String clientIp) {
        String timestamp = LocalDateTime.now().format(formatter);
        logger.warn("[SECURITY] [INPUT_VALIDATION_FAILURE] [{}] Client IP: {} | Field: {} | Reason: {}",
                timestamp, clientIp, field != null ? field : "unknown", reason);
    }

    /**
     * Log a rate limit exceeded event.
     *
     * @param endpoint the endpoint that was rate limited
     * @param clientIp the client IP address
     * @param limit the rate limit configuration (e.g., "5 requests per 60 seconds")
     */
    public void logRateLimitExceeded(String endpoint, String clientIp, String limit) {
        String timestamp = LocalDateTime.now().format(formatter);
        logger.warn("[SECURITY] [RATE_LIMIT_EXCEEDED] [{}] Client IP: {} | Endpoint: {} | Limit: {}",
                timestamp, clientIp, endpoint, limit);
    }
}
