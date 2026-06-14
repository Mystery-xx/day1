package com.aichat.repository;

import com.aichat.entity.ChatMessage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {
    
    List<ChatMessage> findBySessionIdOrderByCreatedAtAsc(String sessionId);
    
    void deleteBySessionId(String sessionId);
    
    @Query("SELECT m.sessionId FROM ChatMessage m GROUP BY m.sessionId ORDER BY MAX(m.createdAt) DESC")
    List<String> findAllSessionIds();
    
    @Query("SELECT m FROM ChatMessage m WHERE m.sessionId = :sessionId ORDER BY m.createdAt DESC")
    List<ChatMessage> findBySessionIdLatestFirst(@Param("sessionId") String sessionId);
}
