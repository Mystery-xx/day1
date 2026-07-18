package com.aichat;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.EnableAspectJAutoProxy;

@SpringBootApplication
@EnableAspectJAutoProxy
public class AiChatApplication {
    public static void main(String[] args) {
        SpringApplication.run(AiChatApplication.class, args);
    }
}
