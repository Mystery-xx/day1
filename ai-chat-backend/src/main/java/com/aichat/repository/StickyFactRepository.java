package com.aichat.repository;

import com.aichat.entity.StickyFact;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface StickyFactRepository extends JpaRepository<StickyFact, Long> {

    List<StickyFact> findBySessionIdOrderByFactKeyAsc(String sessionId);

    Optional<StickyFact> findBySessionIdAndFactKey(String sessionId, String factKey);

    void deleteBySessionIdAndFactKey(String sessionId, String factKey);

    void deleteBySessionId(String sessionId);

    List<StickyFact> findBySessionIdAndIsAutoExtracted(String sessionId, boolean isAutoExtracted);
}
