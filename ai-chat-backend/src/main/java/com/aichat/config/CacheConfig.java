package com.aichat.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.cache.CacheManager;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.cache.annotation.EnableCaching;

import java.util.Arrays;
import java.util.concurrent.TimeUnit;

/**
 * Caffeine cache configuration for short-term dialog and working task state memory.
 * <p>
 * Configures two cache regions:
 * <ul>
 *   <li>"short-term-dialog" - Active dialog context with 30-minute TTL</li>
 *   <li>"working-task-state" - Task state data with 30-minute TTL</li>
 * </ul>
 * Both caches use LRU eviction with max size of 1000 entries.
 */
@Configuration
@EnableCaching
public class CacheConfig {

    /**
     * Configures the Caffeine CacheManager with predefined caches.
     * <p>
     * Cache specification:
     * - maximumSize=1000: LRU eviction when cache exceeds 1000 entries
     * - expireAfterWrite=30m: Entries expire 30 minutes after write
     *
     * @return CacheManager configured with Caffeine
     */
    @Bean
    public CacheManager cacheManager() {
        CaffeineCacheManager cacheManager = new CaffeineCacheManager();
        cacheManager.setCaffeine(Caffeine.newBuilder()
                .maximumSize(1000)
                .expireAfterWrite(30, TimeUnit.MINUTES));
        cacheManager.setCacheNames(Arrays.asList(
                "short-term-dialog",
                "working-task-state"
        ));
        return cacheManager;
    }
}
