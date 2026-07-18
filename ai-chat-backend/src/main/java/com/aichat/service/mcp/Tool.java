package com.aichat.service.mcp;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Annotation to mark a method as an MCP tool.
 * 
 * Used by CrmMcpServer to expose methods as callable tools.
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface Tool {
    
    /**
     * The name of the tool.
     */
    String name();
    
    /**
     * Description of what the tool does.
     */
    String description() default "";
}
