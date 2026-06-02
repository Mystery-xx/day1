package com.aichat.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.ExchangeStrategies;
import reactor.netty.http.client.HttpClient;
import reactor.netty.resources.ConnectionProvider;

import java.time.Duration;

@Configuration
public class WebClientConfig {

    @Bean
    public WebClient webClient(AiChatProperties properties) {
        // Create connection provider
        ConnectionProvider provider = ConnectionProvider.builder("http-pool")
                .maxIdleTime(Duration.ofSeconds(30))
                .maxLifeTime(Duration.ofMinutes(1))
                .build();

        // Create HttpClient with custom response timeout
        HttpClient httpClient = HttpClient.create(provider)
                .responseTimeout(Duration.ofSeconds(120));

        // Create exchange strategies for max in-memory size
        ExchangeStrategies strategies = ExchangeStrategies.builder()
                .codecs(clientCodecConfigurer -> 
                    clientCodecConfigurer.defaultCodecs().maxInMemorySize(16 * 1024 * 1024))
                .build();

        return WebClient.builder()
                .baseUrl(properties.getUrl())
                .clientConnector(new org.springframework.web.reactive.function.client.ReactorClientHttpConnector(httpClient))
                .exchangeStrategies(strategies)
                .build();
    }
}
