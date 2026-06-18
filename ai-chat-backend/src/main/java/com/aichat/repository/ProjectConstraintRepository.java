package com.aichat.repository;

import com.aichat.entity.ProjectConstraint;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Repository interface for ProjectConstraint entities.
 * Provides CRUD operations and custom query methods for accessing project constraints.
 */
@Repository
public interface ProjectConstraintRepository extends JpaRepository<ProjectConstraint, Long> {

    /**
     * Find all project constraints by user ID.
     *
     * @param userId the user ID
     * @return list of project constraints for the user
     */
    List<ProjectConstraint> findByUserId(Long userId);

    /**
     * Find all project constraints by user ID, ordered by creation date descending.
     *
     * @param userId the user ID
     * @return list of project constraints ordered by creation date (newest first)
     */
    List<ProjectConstraint> findByUserIdOrderByCreatedAtDesc(Long userId);

    /**
     * Find project constraints by type using JPQL.
     *
     * @param type the constraint type to search for
     * @return list of matching project constraints
     */
    @Query("SELECT pc FROM ProjectConstraint pc WHERE pc.type = :type")
    List<ProjectConstraint> findByType(@Param("type") String type);

    /**
     * Find project constraints by user ID using JPQL with snake_case table name.
     *
     * @param userId the user ID
     * @return list of project constraints for the user
     */
    @Query("SELECT pc FROM ProjectConstraint pc WHERE pc.user.id = :userId")
    List<ProjectConstraint> findByUserIdJPQL(@Param("userId") Long userId);

    /**
     * Find project constraints by severity using JPQL.
     *
     * @param severity the severity level to filter by
     * @return list of matching project constraints
     */
    @Query("SELECT pc FROM ProjectConstraint pc WHERE pc.severity = :severity")
    List<ProjectConstraint> findBySeverity(@Param("severity") String severity);
}
