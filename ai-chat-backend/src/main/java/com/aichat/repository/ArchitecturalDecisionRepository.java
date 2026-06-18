package com.aichat.repository;

import com.aichat.entity.ArchitecturalDecision;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Repository interface for ArchitecturalDecision entities.
 * Provides CRUD operations and custom query methods for accessing architectural decisions.
 */
@Repository
public interface ArchitecturalDecisionRepository extends JpaRepository<ArchitecturalDecision, Long> {

    /**
     * Find all architectural decisions by user ID.
     *
     * @param userId the user ID
     * @return list of architectural decisions for the user
     */
    List<ArchitecturalDecision> findByUserId(Long userId);

    /**
     * Find all architectural decisions by user ID, ordered by creation date descending.
     *
     * @param userId the user ID
     * @return list of architectural decisions ordered by creation date (newest first)
     */
    List<ArchitecturalDecision> findByUserIdOrderByCreatedAtDesc(Long userId);

    /**
     * Find architectural decisions by title keyword using JPQL.
     *
     * @param keyword the title keyword to search for
     * @return list of matching architectural decisions
     */
    @Query("SELECT ad FROM ArchitecturalDecision ad WHERE ad.title LIKE %:keyword%")
    List<ArchitecturalDecision> findByTitleKeyword(@Param("keyword") String keyword);

    /**
     * Find architectural decisions by user ID using JPQL with snake_case table name.
     *
     * @param userId the user ID
     * @return list of architectural decisions for the user
     */
    @Query("SELECT ad FROM ArchitecturalDecision ad WHERE ad.user.id = :userId")
    List<ArchitecturalDecision> findByUserIdJPQL(@Param("userId") Long userId);
}
