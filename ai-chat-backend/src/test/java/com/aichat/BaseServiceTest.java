package com.aichat;

import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Inherited;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Base annotation for service layer unit tests.
 * Enables Mockito annotations (@Mock, @InjectMocks).
 * 
 * Usage: @BaseServiceTest on test class
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Inherited
@ExtendWith(MockitoExtension.class)
public @interface BaseServiceTest {
}
