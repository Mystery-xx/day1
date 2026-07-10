package com.aichat.repository;

import com.aichat.entity.TaskState;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface TaskStateRepository extends JpaRepository<TaskState, Long> {
    Optional<TaskState> findBySessionId(String sessionId);
    void deleteBySessionId(String sessionId);
}
