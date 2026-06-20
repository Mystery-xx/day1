package com.aichat.repository;

import com.aichat.entity.ChatSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface ChatSessionRepository extends JpaRepository<ChatSession, Long> {
    
    Optional<ChatSession> findBySessionId(String sessionId);
    
    boolean existsBySessionId(String sessionId);
}
