package com.aichat.service.support;

import com.aichat.dto.support.TicketDTO;
import com.aichat.entity.SupportUser;
import com.aichat.entity.TicketStatus;
import com.aichat.entity.TicketPriority;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.fasterxml.jackson.datatype.jsr310.deser.LocalDateTimeDeserializer;
import com.fasterxml.jackson.datatype.jsr310.ser.LocalDateTimeSerializer;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.stream.Collectors;

@Service
public class TicketService {
    
    private final ObjectMapper objectMapper;
    private final List<TicketDTO> tickets = new CopyOnWriteArrayList<>();
    private final List<SupportUser> users = new CopyOnWriteArrayList<>();
    
    public TicketService() {
        this.objectMapper = new ObjectMapper();
        JavaTimeModule javaTimeModule = new JavaTimeModule();
        DateTimeFormatter formatter = DateTimeFormatter.ISO_LOCAL_DATE_TIME;
        javaTimeModule.addDeserializer(LocalDateTime.class, new LocalDateTimeDeserializer(formatter));
        javaTimeModule.addSerializer(LocalDateTime.class, new LocalDateTimeSerializer(formatter));
        this.objectMapper.registerModule(javaTimeModule);
    }
    
    @PostConstruct
    public void init() throws IOException {
        loadTickets();
        loadUsers();
    }
    
    private void loadTickets() throws IOException {
        tickets.clear();
        ClassPathResource resource = new ClassPathResource("support-data/tickets.json");
        try (var is = resource.getInputStream()) {
            tickets.addAll(objectMapper.readValue(is, new TypeReference<List<TicketDTO>>() {}));
        }
    }
    
    private void loadUsers() throws IOException {
        users.clear();
        ClassPathResource resource = new ClassPathResource("support-data/users.json");
        try (var is = resource.getInputStream()) {
            users.addAll(objectMapper.readValue(is, new TypeReference<List<SupportUser>>() {}));
        }
    }
    
    public List<TicketDTO> findAll() {
        return new ArrayList<>(tickets);
    }
    
    public Optional<TicketDTO> findById(String ticketId) {
        return tickets.stream()
            .filter(t -> t.getTicketId().equals(ticketId))
            .findFirst();
    }
    
    public List<TicketDTO> findByUserId(String userId) {
        return tickets.stream()
            .filter(t -> t.getUserId().equals(userId))
            .collect(Collectors.toList());
    }
    
    public TicketDTO createTicket(String userId, String subject, String description) {
        String ticketId = "TKT-" + String.format("%03d", tickets.size() + 1);
        TicketDTO ticket = new TicketDTO();
        ticket.setTicketId(ticketId);
        ticket.setUserId(userId);
        ticket.setSubject(subject);
        ticket.setDescription(description);
        ticket.setStatus(TicketStatus.OPEN.name());
        ticket.setPriority(TicketPriority.MEDIUM.name());
        ticket.setCreatedAt(LocalDateTime.now());
        
        SupportUser user = findUserById(userId);
        if (user != null) {
            ticket.setUserName(user.getName());
            ticket.setUserEmail(user.getEmail());
        }
        
        tickets.add(ticket);
        return ticket;
    }
    
    public void addMessage(String ticketId, String message) {
        // Для упрощённой версии просто логируем сообщение
        System.out.println("Message added to " + ticketId + ": " + message);
    }
    
    public SupportUser findUserById(String userId) {
        return users.stream()
            .filter(u -> u.getUserId().equals(userId))
            .findFirst()
            .orElse(null);
    }
}
