package com.aichat.repository;

import com.aichat.entity.McpServerConfig;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface McpServerRepository extends JpaRepository<McpServerConfig, Long> {
    java.util.Optional<McpServerConfig> findByName(String name);
}
