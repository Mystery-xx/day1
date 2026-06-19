package com.aichat.health;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.Map;

/**
 * Health indicator for 3-level memory storage layers.
 * Checks health of H2, PostgreSQL, SQLite databases and Caffeine cache.
 */
@Component
public class StorageHealthIndicator implements HealthIndicator {

    private static final Logger log = LoggerFactory.getLogger(StorageHealthIndicator.class);

    private final DataSource h2DataSource;
    private final DataSource postgresqlDataSource;
    private final DataSource sqliteDataSource;

    public StorageHealthIndicator(DataSource h2DataSource,
                                   @org.springframework.beans.factory.annotation.Qualifier("postgresqlDataSource") @org.springframework.beans.factory.annotation.Autowired(required = false) DataSource postgresqlDataSource,
                                   @org.springframework.beans.factory.annotation.Qualifier("sqliteDataSource") @org.springframework.beans.factory.annotation.Autowired(required = false) DataSource sqliteDataSource) {
        this.h2DataSource = h2DataSource;
        this.postgresqlDataSource = postgresqlDataSource;
        this.sqliteDataSource = sqliteDataSource;
    }

    @Override
    public Health health() {
        log.debug("Performing storage health check");
        
        Map<String, Object> details = new HashMap<>();
        boolean allHealthy = true;

        // Check H2
        boolean h2Healthy = checkDatabaseHealth("H2", h2DataSource);
        details.put("h2", h2Healthy ? "UP" : "DOWN");
        allHealthy &= h2Healthy;

        // Check PostgreSQL
        boolean postgresqlHealthy = checkDatabaseHealth("PostgreSQL", postgresqlDataSource);
        details.put("postgresql", postgresqlHealthy ? "UP" : "DOWN");
        allHealthy &= postgresqlHealthy;

        // Check SQLite
        boolean sqliteHealthy = checkDatabaseHealth("SQLite", sqliteDataSource);
        details.put("sqlite", sqliteHealthy ? "UP" : "DOWN");
        allHealthy &= sqliteHealthy;

        // Caffeine cache is always UP if Spring context started
        details.put("caffeine", "UP");

        details.put("overall", allHealthy ? "UP" : "DOWN");

        if (allHealthy) {
            return Health.up().withDetails(details).build();
        } else {
            return Health.down().withDetails(details).build();
        }
    }

    private boolean checkDatabaseHealth(String name, DataSource dataSource) {
        if (dataSource == null) {
            log.warn("{} datasource not configured", name);
            return false;
        }
        try (Connection connection = dataSource.getConnection()) {
            boolean isValid = connection.isValid(5);
            log.debug("{} database health check: {}", name, isValid ? "UP" : "DOWN");
            return isValid;
        } catch (SQLException e) {
            log.error("{} database health check failed: {}", name, e.getMessage());
            return false;
        }
    }
}
