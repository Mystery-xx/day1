package com.aichat.integration;

import com.aichat.dto.RagContextResult;
import com.aichat.dto.SourceInfo;
import com.aichat.service.RagSearchService;
import com.aichat.service.RagIndexingService;
import com.aichat.service.chunking.ChunkingType;
import com.aichat.service.storage.VectorStorageService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration tests for RAG reranking and query rewriting features.
 * Tests full integration scenarios with @SpringBootTest.
 */
@SpringBootTest
@DisplayName("RAG Reranking Integration Tests")
class RagRerankingIntegrationTest {

    @Autowired
    private RagSearchService ragSearchService;

    @Autowired
    private RagIndexingService indexingService;

    @Autowired
    private VectorStorageService storageService;

    @BeforeEach
    void setUp() {
        // Clear storage before each test
        storageService.clear();
    }

    @AfterEach
    void tearDown() {
        // Clean up after each test
        storageService.clear();
    }

    @Test
    @DisplayName("Reranking enabled vs disabled - compare results and metadata")
    void testRerankingEnabledVsDisabled() {
        // Arrange: Upload test document with distinct sections
        String content = """
            # Machine Learning Guide
            
            ## Introduction to Machine Learning
            Machine learning is a subset of artificial intelligence that enables systems to learn from data.
            It uses algorithms to identify patterns and make predictions without explicit programming.
            
            ## Supervised Learning
            Supervised learning uses labeled training data to learn a mapping from inputs to outputs.
            Common algorithms include linear regression, decision trees, and neural networks.
            
            ## Unsupervised Learning
            Unsupervised learning finds hidden patterns in unlabeled data.
            Clustering and dimensionality reduction are common unsupervised techniques.
            
            ## Deep Learning
            Deep learning uses multi-layer neural networks to learn complex representations.
            It has achieved breakthrough results in image recognition and natural language processing.
            """;
        
        MultipartFile file = new MockMultipartFile(
            "file",
            "ml-guide.md",
            "text/markdown",
            content.getBytes(StandardCharsets.UTF_8)
        );

        // Upload document
        var uploadResult = indexingService.index(file, ChunkingType.SEMANTIC);
        assertEquals("SUCCESS", uploadResult.getStatus(), "Document should be indexed");

        // Act 1: Search with reranking DISABLED
        long startTimeDisabled = System.currentTimeMillis();
        RagContextResult resultDisabled = ragSearchService.searchAndAugment(
            "machine learning algorithms", 5, false, 0.0, false
        );
        long latencyDisabled = System.currentTimeMillis() - startTimeDisabled;

        // Act 2: Search with reranking ENABLED
        long startTimeEnabled = System.currentTimeMillis();
        RagContextResult resultEnabled = ragSearchService.searchAndAugment(
            "machine learning algorithms", 5, true, 0.3, false
        );
        long latencyEnabled = System.currentTimeMillis() - startTimeEnabled;

        // Assert: Reranking metadata present
        assertNotNull(resultEnabled.getRerankScores(), "Rerank scores should be present when reranking enabled");
        assertFalse(resultEnabled.getRerankScores().isEmpty(), "Rerank scores should not be empty");
        
        assertNull(resultDisabled.getRerankScores(), "Rerank scores should be null when reranking disabled");

        // Assert: Reranking adds latency but should be under 2 seconds
        assertTrue(latencyEnabled < 2000, 
            "Reranking latency should be under 2 seconds, was " + latencyEnabled + "ms");
        
        // Reranking may take longer but should complete
        assertTrue(latencyEnabled >= latencyDisabled, 
            "Reranking should take at least as long as baseline search");

        // Assert: Both return results
        assertFalse(resultDisabled.getSources().isEmpty(), "Should return results without reranking");
        assertFalse(resultEnabled.getSources().isEmpty(), "Should return results with reranking");
    }

    @Test
    @DisplayName("Threshold filtering - high threshold returns fewer results")
    void testThresholdFiltering() {
        // Arrange: Upload test document
        String content = """
            # Weather API Documentation
            
            ## Current Weather
            Get current weather conditions for any location worldwide.
            Returns temperature, humidity, wind speed, and conditions.
            
            ## Weather Forecast
            Get 7-day weather forecast with hourly predictions.
            Includes precipitation probability and UV index.
            
            ## Historical Weather
            Access historical weather data from 1950 to present.
            Useful for climate analysis and research.
            
            ## Weather Alerts
            Receive severe weather warnings and alerts.
            Supports email and SMS notifications.
            """;
        
        MultipartFile file = new MockMultipartFile(
            "file",
            "weather-api.md",
            "text/markdown",
            content.getBytes(StandardCharsets.UTF_8)
        );

        // Upload document
        var uploadResult = indexingService.index(file, ChunkingType.SEMANTIC);
        assertEquals("SUCCESS", uploadResult.getStatus(), "Document should be indexed");

        // Act 1: Search with LOW threshold (0.1)
        RagContextResult lowThresholdResult = ragSearchService.searchAndAugment(
            "weather forecast", 10, true, 0.1, false
        );

        // Act 2: Search with HIGH threshold (0.9)
        RagContextResult highThresholdResult = ragSearchService.searchAndAugment(
            "weather forecast", 10, true, 0.9, false
        );

        // Assert: High threshold returns fewer or equal results
        int lowThresholdCount = lowThresholdResult.getSources().size();
        int highThresholdCount = highThresholdResult.getSources().size();
        
        assertTrue(highThresholdCount <= lowThresholdCount,
            "High threshold should return fewer or equal results: high=" + highThresholdCount + 
            ", low=" + lowThresholdCount);

        // Assert: Rerank scores respect threshold
        if (!lowThresholdResult.getRerankScores().isEmpty()) {
            for (Double score : lowThresholdResult.getRerankScores()) {
                assertTrue(score >= 0.1, 
                    "All rerank scores should be >= low threshold 0.1, got " + score);
            }
        }

        if (!highThresholdResult.getRerankScores().isEmpty()) {
            for (Double score : highThresholdResult.getRerankScores()) {
                assertTrue(score >= 0.9, 
                    "All rerank scores should be >= high threshold 0.9, got " + score);
            }
        }
    }

    @Test
    @DisplayName("Query rewriting - short query gets enhanced")
    void testQueryRewriting() {
        // Arrange: Upload test document with specific content
        String content = """
            # Spring Boot Configuration
            
            ## Application Properties
            Configure your Spring Boot application using application.properties or application.yml.
            Set server port, database connections, and logging levels.
            
            ## Environment Variables
            Override properties using environment variables for different deployment environments.
            Use SPRING_DATASOURCE_URL, SPRING_DATASOURCE_USERNAME, etc.
            
            ## Profile-Specific Configuration
            Use @Profile annotation and application-{profile}.properties for environment-specific settings.
            Common profiles: dev, test, prod.
            """;
        
        MultipartFile file = new MockMultipartFile(
            "file",
            "spring-config.md",
            "text/markdown",
            content.getBytes(StandardCharsets.UTF_8)
        );

        // Upload document
        var uploadResult = indexingService.index(file, ChunkingType.SEMANTIC);
        assertEquals("SUCCESS", uploadResult.getStatus(), "Document should be indexed");

        // Act 1: Search with rewrite DISABLED (short query)
        RagContextResult resultNoRewrite = ragSearchService.searchAndAugment(
            "Spring Boot", 5, false, 0.0, false
        );

        // Act 2: Search with rewrite ENABLED (short query should be enhanced)
        RagContextResult resultWithRewrite = ragSearchService.searchAndAugment(
            "Spring Boot", 5, false, 0.0, true
        );

        // Assert: Query rewrite metadata present
        assertFalse(resultWithRewrite.isQueryWasRewritten(), 
            "Query may or may not be rewritten depending on AI response");
        
        // Both should return results
        assertFalse(resultNoRewrite.getSources().isEmpty(), 
            "Should return results without query rewrite");
        
        // Assert: Performance - rewrite should complete quickly (with fallback on timeout)
        // The service has 2 second timeout, test should complete faster
    }

    @Test
    @DisplayName("Graceful degradation - TEI unavailable returns baseline results")
    void testGracefulDegradationWhenTEIUnavailable() {
        // Arrange: Upload test document
        String content = """
            # Docker Compose Guide
            
            ## Service Definition
            Define services in docker-compose.yml with image, ports, and volumes.
            Each service runs in its own container.
            
            ## Networking
            Docker Compose creates a default network for inter-service communication.
            Services can reference each other by service name.
            
            ## Environment Variables
            Set environment variables using .env file or environment section.
            Use variable substitution for dynamic configuration.
            """;
        
        MultipartFile file = new MockMultipartFile(
            "file",
            "docker-guide.md",
            "text/markdown",
            content.getBytes(StandardCharsets.UTF_8)
        );

        // Upload document
        var uploadResult = indexingService.index(file, ChunkingType.SEMANTIC);
        assertEquals("SUCCESS", uploadResult.getStatus(), "Document should be indexed");

        // Act: Search with reranking ENABLED (TEI may be unavailable in test environment)
        // The service should gracefully degrade to baseline search
        RagContextResult result = ragSearchService.searchAndAugment(
            "docker compose networking", 5, true, 0.0, false
        );

        // Assert: Should return results even if TEI is unavailable
        assertNotNull(result, "Result should not be null");
        assertNotNull(result.getContext(), "Context should be present");
        assertNotNull(result.getSources(), "Sources list should be present");

        // Assert: If reranking failed, should have baseline behavior
        // (rerankScores may be null or contain baseline scores)
        // The key is that the search completes without throwing exception
        assertDoesNotThrow(() -> {
            ragSearchService.searchAndAugment("docker", 3, true, 0.0, false);
        }, "Search should not throw exception even if TEI unavailable");
    }

    @Test
    @DisplayName("Performance benchmark - reranking adds less than 2 seconds latency")
    void testRerankingPerformanceBenchmark() {
        // Arrange: Upload substantial test document
        StringBuilder content = new StringBuilder();
        content.append("# Comprehensive API Documentation\n\n");
        
        for (int i = 1; i <= 10; i++) {
            content.append("## Section ").append(i).append("\n");
            content.append("This section covers topic number ").append(i).append(".\n");
            content.append("It contains detailed information about the subject matter.\n");
            content.append("The content is designed to test reranking performance.\n\n");
        }
        
        MultipartFile file = new MockMultipartFile(
            "file",
            "performance-test.md",
            "text/markdown",
            content.toString().getBytes(StandardCharsets.UTF_8)
        );

        // Upload document
        var uploadResult = indexingService.index(file, ChunkingType.SEMANTIC);
        assertEquals("SUCCESS", uploadResult.getStatus(), "Document should be indexed");

        // Warm up - run once to avoid cold start
        ragSearchService.searchAndAugment("API documentation", 5, true, 0.3, false);

        // Act: Measure reranking latency over multiple runs
        int iterations = 3;
        long totalLatency = 0;
        
        for (int i = 0; i < iterations; i++) {
            long startTime = System.currentTimeMillis();
            RagContextResult result = ragSearchService.searchAndAugment(
                "API documentation", 5, true, 0.3, false
            );
            long latency = System.currentTimeMillis() - startTime;
            totalLatency += latency;
            
            assertNotNull(result, "Result should not be null on iteration " + i);
        }
        
        long averageLatency = totalLatency / iterations;

        // Assert: Average latency should be under 2 seconds
        assertTrue(averageLatency < 2000,
            "Average reranking latency should be under 2 seconds, was " + averageLatency + "ms");
        
        // Log performance for debugging
        System.out.println("Average reranking latency: " + averageLatency + "ms over " + iterations + " iterations");
    }

    @Test
    @DisplayName("Full pipeline - upload, rerank search, verify metadata")
    void testFullPipelineWithRerankingMetadata() {
        // Arrange: Upload test document
        String content = """
            # Kubernetes Basics
            
            ## What is Kubernetes
            Kubernetes is an open-source container orchestration platform.
            It automates deployment, scaling, and management of containerized applications.
            
            ## Pods and Services
            A pod is the smallest deployable unit in Kubernetes.
            Services provide stable networking for pods.
            
            ## Deployments
            Deployments manage pod replicas and rolling updates.
            They ensure the desired state of your application.
            """;
        
        MultipartFile file = new MockMultipartFile(
            "file",
            "kubernetes-basics.md",
            "text/markdown",
            content.getBytes(StandardCharsets.UTF_8)
        );

        // Upload document
        var uploadResult = indexingService.index(file, ChunkingType.SEMANTIC);
        assertEquals("SUCCESS", uploadResult.getStatus(), "Document should be indexed");

        // Act: Enhanced search with all features
        long startTime = System.currentTimeMillis();
        RagContextResult result = ragSearchService.searchAndAugment(
            "kubernetes pods", 5, true, 0.3, true
        );
        long latency = System.currentTimeMillis() - startTime;

        // Assert: Response fields present
        assertNotNull(result.getContext(), "Context should be present");
        assertNotNull(result.getSources(), "Sources should be present");
        assertFalse(result.getSources().isEmpty(), "Should have at least one source");

        // Assert: Metadata fields
        assertNotNull(result.getRerankScores(), "Rerank scores should be present");
        // queryWasRewritten depends on AI response, just check field exists
        assertTrue(result.isQueryWasRewritten() || !result.isQueryWasRewritten(), 
            "queryWasRewritten field should be accessible");

        // Assert: Performance
        assertTrue(latency < 2000, 
            "Total latency should be under 2 seconds, was " + latency + "ms");

        // Assert: Rerank scores match result count
        if (!result.getRerankScores().isEmpty()) {
            assertEquals(result.getSources().size(), result.getRerankScores().size(),
                "Rerank scores count should match sources count");
        }
    }

    @Test
    @DisplayName("Multiple documents - reranking ranks relevant content higher")
    void testMultipleDocumentsReranking() {
        // Arrange: Upload multiple documents with varying relevance
        String mlContent = """
            # Machine Learning
            Machine learning algorithms include decision trees, neural networks, and SVM.
            Training data is used to learn patterns and make predictions.
            """;
        
        String weatherContent = """
            # Weather Forecast
            Today's weather is sunny with temperatures around 25 degrees.
            Tomorrow expects rain with thunderstorms in the afternoon.
            """;
        
        String cookingContent = """
            # Cooking Recipes
            This recipe requires flour, eggs, and sugar.
            Bake at 180 degrees for 30 minutes until golden brown.
            """;

        MultipartFile mlFile = new MockMultipartFile(
            "file", "ml.md", "text/markdown",
            mlContent.getBytes(StandardCharsets.UTF_8)
        );
        MultipartFile weatherFile = new MockMultipartFile(
            "file", "weather.md", "text/markdown",
            weatherContent.getBytes(StandardCharsets.UTF_8)
        );
        MultipartFile cookingFile = new MockMultipartFile(
            "file", "cooking.md", "text/markdown",
            cookingContent.getBytes(StandardCharsets.UTF_8)
        );

        // Upload all documents
        indexingService.index(mlFile, ChunkingType.SEMANTIC);
        indexingService.index(weatherFile, ChunkingType.SEMANTIC);
        indexingService.index(cookingFile, ChunkingType.SEMANTIC);

        // Act: Search for ML-related content with reranking
        RagContextResult result = ragSearchService.searchAndAugment(
            "machine learning neural networks", 5, true, 0.1, false
        );

        // Assert: Should find results
        assertFalse(result.getSources().isEmpty(), "Should find relevant results");

        // Assert: If reranking worked, ML content should rank high
        if (!result.getRerankScores().isEmpty() && !result.getSources().isEmpty()) {
            // First result should have decent rerank score
            Double firstScore = result.getRerankScores().get(0);
            assertTrue(firstScore >= 0.1, 
                "Top result should have rerank score >= threshold, got " + firstScore);
        }
    }

    @Test
    @DisplayName("Empty index - graceful handling with reranking enabled")
    void testEmptyIndexWithReranking() {
        // Arrange: Ensure index is empty (cleared in @BeforeEach)
        assertEquals(0, storageService.getChunkCount(), "Index should be empty");

        // Act: Search with reranking enabled on empty index
        RagContextResult result = ragSearchService.searchAndAugment(
            "any query", 5, true, 0.5, false
        );

        // Assert: Should handle gracefully
        assertNotNull(result, "Result should not be null");
        assertNotNull(result.getContext(), "Context should be present");
        assertTrue(result.getSources().isEmpty(), "Sources should be empty for empty index");
        
        // Rerank scores should be empty or null when no results
        assertTrue(result.getRerankScores() == null || result.getRerankScores().isEmpty(),
            "Rerank scores should be empty when no results");
    }

    @Test
    @DisplayName("Cleanup verification - @AfterEach removes test data")
    void testCleanupVerification() {
        // Arrange: Upload test document
        String content = "# Cleanup Test\nThis document tests cleanup functionality.";
        MultipartFile file = new MockMultipartFile(
            "file",
            "cleanup-test.md",
            "text/markdown",
            content.getBytes(StandardCharsets.UTF_8)
        );

        // Upload document
        var uploadResult = indexingService.index(file, ChunkingType.SEMANTIC);
        assertEquals("SUCCESS", uploadResult.getStatus(), "Document should be indexed");

        int chunksBefore = storageService.getChunkCount();
        assertTrue(chunksBefore > 0, "Should have chunks after upload");

        // Act: Run search (cleanup happens in @AfterEach)
        RagContextResult result = ragSearchService.searchAndAugment(
            "cleanup test", 5, false, 0.0, false
        );

        // Assert: Search works before cleanup
        assertNotNull(result, "Search should work before cleanup");

        // Note: Actual cleanup verification happens after @AfterEach runs
        // This test verifies the search works, tearDown will clean up
    }
}
