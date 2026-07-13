package com.aichat.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Annotation for applying rate limiting to controller methods.
 * Limits the number of requests that can be made within a specified time window.
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface RateLimit {
    /**
     * Maximum number of requests allowed within the time window.
     * @return the number of requests permitted
     */
    int requests();
    
    /**
     * Time window in seconds for the rate limit.
     * @return the time window duration in seconds
     */
    int seconds();
}
