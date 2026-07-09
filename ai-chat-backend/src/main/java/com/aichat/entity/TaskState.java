package com.aichat.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Entity
@Table(name = "task_state")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class TaskState {

    @Id
    @GeneratedValue
    private Long id;

    @Column(nullable = false, unique = true)
    private String sessionId;

    @Column(length = 2000)
    private String goal;

    @Enumerated(EnumType.STRING)
    private TaskStatus status;

    @Lob
    private String constraintsJson;

    @Lob
    private String clarificationsJson;

    private Instant createdAt;

    private Instant updatedAt;
}