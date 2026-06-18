package com.aichat.repository;

import com.aichat.entity.DomainKnowledge;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Repository interface for DomainKnowledge entities.
 * Provides CRUD operations and custom query methods for accessing domain knowledge.
 */
@Repository
public interface DomainKnowledgeRepository extends JpaRepository<DomainKnowledge, Long> {

    /**
     * Find all domain knowledge entries by user ID.
     *
     * @param userId the user ID
     * @return list of domain knowledge entries for the user
     */
    List<DomainKnowledge> findByUserId(Long userId);

    /**
     * Find all domain knowledge entries by user ID, ordered by creation date descending.
     *
     * @param userId the user ID
     * @return list of domain knowledge entries ordered by creation date (newest first)
     */
    List<DomainKnowledge> findByUserIdOrderByCreatedAtDesc(Long userId);

    /**
     * Find domain knowledge by topic keyword using JPQL.
     *
     * @param keyword the topic keyword to search for
     * @return list of matching domain knowledge entries
     */
    @Query("SELECT dk FROM DomainKnowledge dk WHERE dk.topic LIKE %:keyword%")
    List<DomainKnowledge> findByTopicKeyword(@Param("keyword") String keyword);

    /**
     * Find domain knowledge by user ID using JPQL with snake_case table name.
     *
     * @param userId the user ID
     * @return list of domain knowledge entries for the user
     */
    @Query("SELECT dk FROM DomainKnowledge dk WHERE dk.user.id = :userId")
    List<DomainKnowledge> findByUserIdJPQL(@Param("userId") Long userId);

    /**
     * Find domain knowledge by source using JPQL.
     *
     * @param source the source to filter by
     * @return list of matching domain knowledge entries
     */
    @Query("SELECT dk FROM DomainKnowledge dk WHERE dk.source = :source")
    List<DomainKnowledge> findBySource(@Param("source") String source);
}
