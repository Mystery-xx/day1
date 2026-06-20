package com.aichat.repository;

import com.aichat.entity.TaskContextEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface TaskContextRepository extends JpaRepository<TaskContextEntity, Long> {
    
    Optional<TaskContextEntity> findBySessionId(Long sessionId);
    
    boolean existsBySessionId(Long sessionId);
    
    void deleteBySessionId(Long sessionId);
}
