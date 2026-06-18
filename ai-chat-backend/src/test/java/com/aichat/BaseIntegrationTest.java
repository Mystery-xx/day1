package com.aichat;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Inherited;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Base annotation for integration tests.
 * Loads full Spring application context with 'test' profile.
 * 
 * Usage: @BaseIntegrationTest on test class
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Inherited
@SpringBootTest(classes = AiChatApplication.class)
@ActiveProfiles("test")
public @interface BaseIntegrationTest {
}
