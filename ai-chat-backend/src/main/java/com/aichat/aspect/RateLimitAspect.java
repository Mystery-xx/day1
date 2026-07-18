package com.aichat.aspect;

import com.aichat.annotation.RateLimit;
import com.aichat.exception.RateLimitExceededException;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Refill;
import jakarta.servlet.http.HttpServletRequest;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Aspect for applying rate limiting to methods annotated with @RateLimit.
 * Uses Bucket4j for token bucket algorithm implementation.
 * Maintains per-IP rate limit buckets.
 */
@Aspect
@Component
public class RateLimitAspect {
    
    private static final Logger logger = LoggerFactory.getLogger(RateLimitAspect.class);
    
    /**
     * Map of bucket keys to Bucket instances.
     * Key format: "ip:endpoint"
     */
    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();
    
    /**
     * Around advice that applies rate limiting to annotated methods.
     * 
     * @param joinPoint the join point being advised
     * @param rateLimit the RateLimit annotation instance
     * @return the result of the method invocation
     * @throws Throwable if the method invocation throws an exception
     */
    @Around("@annotation(rateLimit)")
    public Object applyRateLimit(ProceedingJoinPoint joinPoint, RateLimit rateLimit) throws Throwable {
        String clientIp = getClientIp();
        String endpoint = joinPoint.getSignature().toShortString();
        String bucketKey = clientIp + ":" + endpoint;
        
        Bucket bucket = buckets.computeIfAbsent(bucketKey, k -> createBucket(rateLimit.requests(), rateLimit.seconds()));
        
        if (bucket.tryConsume(1)) {
            logger.debug("Rate limit OK for IP={} endpoint={}, remaining tokens", clientIp, endpoint);
            return joinPoint.proceed();
        } else {
            logger.warn("Rate limit exceeded for IP={} endpoint={} (limit: {}/{}s)", 
                    clientIp, endpoint, rateLimit.requests(), rateLimit.seconds());
            throw new RateLimitExceededException(
                    String.format("Rate limit exceeded: %d requests per %d seconds", 
                            rateLimit.requests(), rateLimit.seconds()));
        }
    }
    
    /**
     * Extracts the client IP address from the current HTTP request context.
     * 
     * @return the client IP address, or "unknown" if not available
     */
    private String getClientIp() {
        try {
            ServletRequestAttributes attributes = 
                    (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attributes != null) {
                HttpServletRequest request = attributes.getRequest();
                
                // Check X-Forwarded-For header first (for proxied requests)
                String xForwardedFor = request.getHeader("X-Forwarded-For");
                if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
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
     * Creates a new Bucket with the specified rate limit configuration.
     * 
     * @param requests the number of requests allowed
     * @param seconds the time window in seconds
     * @return a new Bucket instance
     */
    private Bucket createBucket(int requests, int seconds) {
        Bandwidth limit = Bandwidth.classic(requests, Refill.greedy(requests, Duration.ofSeconds(seconds)));
        return Bucket.builder().addLimit(limit).build();
    }
}
