# Context Management Strategies

## Overview

Effective context management is crucial for maintaining coherent conversations with AI models while staying within token limits. The AI Chat application implements several strategies to optimize context usage, ensuring that the most relevant information is always available to the AI while avoiding token budget exhaustion.

## Token Budget Management

### Understanding Token Limits

AI models have maximum context windows that limit the total number of tokens in a single request:

| Model | Context Window |
|-------|----------------|
| qwen3.5-397b-a17b | 32,768 tokens |
| qwen3.6-27b | 16,384 tokens |
| llama3.1-8b | 8,192 tokens |

**Token Breakdown:**
- System prompt: ~100 tokens
- Message history: Variable (depends on conversation length)
- RAG context: ~500-1,500 tokens (5 chunks × 100-300 tokens each)
- Current query: ~50-200 tokens
- Response reserve: ~500-1,000 tokens

### Budget Allocation Strategy

The application uses a dynamic budget allocation approach:

```
Total Budget = Model Context Window
Reserved for Response = 20% of Total
Available for Context = Total - Reserved - System Prompt

Context Priority:
1. System instructions (fixed)
2. RAG retrieved chunks (if applicable)
3. Sticky facts (important persistent information)
4. Recent conversation history (sliding window)
```

**Implementation:**
```java
public int calculateAvailableContext(int modelWindow) {
    int responseReserve = (int) (modelWindow * 0.2);
    int systemPrompt = 100;
    return modelWindow - responseReserve - systemPrompt;
}
```

## Sliding Window Strategy

The sliding window approach maintains only the most recent N messages in the conversation history.

### Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `maxMessages` | 20 | Maximum messages to keep in context |
| `maxTokens` | 4000 | Hard token limit for history |

### Behavior

When the conversation exceeds the configured limits:

1. **Message Count Exceeded**: Remove oldest messages until under limit
2. **Token Count Exceeded**: Remove messages starting from oldest until under token budget
3. **Preserve System Messages**: Never remove system-level instructions

**Implementation:**
```java
public List<Message> applySlidingWindow(List<Message> history, int maxMessages, int maxTokens) {
    // Remove from front until both constraints satisfied
    while (history.size() > maxMessages || countTokens(history) > maxTokens) {
        history.remove(0);
    }
    return history;
}
```

### Trade-offs

**Advantages:**
- Simple implementation
- Predictable memory usage
- Always includes most recent context

**Disadvantages:**
- Loses important early conversation context
- May forget user preferences stated at conversation start
- No semantic understanding of what to keep

## Sticky Facts Strategy

Sticky facts are important pieces of information that should always remain in context, regardless of the sliding window position.

### What Qualifies as a Sticky Fact

- User preferences (e.g., "I prefer Python over JavaScript")
- Project constraints (e.g., "We're using PostgreSQL database")
- Key decisions (e.g., "We decided to use microservices architecture")
- Personal information shared by user (e.g., "My name is Alex")

### Implementation

Sticky facts are extracted and maintained separately from the conversation history:

```java
public class StickyFactManager {
    private List<String> stickyFacts = new ArrayList<>();
    
    public void addFact(String fact) {
        if (!stickyFacts.contains(fact)) {
            stickyFacts.append(fact);
        }
    }
    
    public void removeFact(String fact) {
        stickyFacts.remove(fact);
    }
    
    public String getFormattedFacts() {
        return stickyFacts.stream()
            .map(f -> "- " + f)
            .collect(Collectors.joining("\n"));
    }
}
```

### Integration with Context

Sticky facts are injected into the system prompt at the beginning of each request:

```
System: You are a helpful assistant.

Sticky Facts:
- User prefers Python for backend development
- Project uses PostgreSQL database
- Deployment target is Docker on Linux

[Rest of conversation...]
```

### Automatic Fact Extraction

Advanced implementations can automatically identify potential sticky facts:

```java
public List<String> extractStickyFacts(Message message) {
    // Use heuristics or a separate AI call to identify important facts
    // Patterns like "I always...", "Remember that...", "Important: ..."
}
```

## Summary Strategy

The summary approach condenses older conversation history into a brief summary, preserving key information while reducing token usage.

### How It Works

1. **Threshold Detection**: When conversation exceeds a certain length, trigger summarization
2. **Summary Generation**: Send older messages to AI with instruction to summarize
3. **Context Replacement**: Replace original messages with summary in future requests

**Summary Prompt:**
```
Summarize the following conversation in 3-5 sentences, capturing:
- Main topics discussed
- Key decisions made
- Important facts established

Conversation:
{older_messages}

Summary:
```

### Implementation Strategy

```java
public String summarizeHistory(List<Message> oldMessages) {
    String summaryPrompt = buildSummaryPrompt(oldMessages);
    return aiService.generateSummary(summaryPrompt);
}

public List<Message> applySummaryStrategy(List<Message> history) {
    if (history.size() > summaryThreshold) {
        int summaryPoint = history.size() / 2;
        List<Message> oldPart = history.subList(0, summaryPoint);
        List<Message> recentPart = history.subList(summaryPoint, history.size());
        
        String summary = summarizeHistory(oldPart);
        Message summaryMessage = Message.system("Conversation Summary: " + summary);
        
        return Stream.concat(
            Stream.of(summaryMessage),
            recentPart.stream()
        ).collect(Collectors.toList());
    }
    return history;
}
```

### Trade-offs

**Advantages:**
- Preserves semantic content of entire conversation
- More intelligent than simple truncation
- Can capture decisions and conclusions

**Disadvantages:**
- Additional AI API calls (cost, latency)
- Summary may lose nuance or specific details
- Complexity in implementation

## Context Truncation Policies

When token budget is exceeded, the application applies truncation policies in a specific order.

### Truncation Order

1. **RAG Chunks**: Reduce from 5 to 3 to 1 if necessary
2. **Older Messages**: Remove messages beyond sliding window
3. **Long Messages**: Truncate individual long messages (preserve first and last 20%)
4. **Sticky Facts**: Never truncate (critical information)

### Message Truncation

For individual messages that are too long:

```java
public String truncateMessage(String message, int maxTokens) {
    if (countTokens(message) <= maxTokens) {
        return message;
    }
    
    // Keep beginning and end, replace middle with ellipsis
    int keepEachSide = maxTokens / 3;
    String beginning = message.substring(0, keepEachSide);
    String end = message.substring(message.length() - keepEachSide);
    
    return beginning + "\n\n[...truncated...]\n\n" + end;
}
```

### RAG Context Reduction

When token budget is tight, reduce RAG context:

```java
public List<SearchResult> adaptRagContext(List<SearchResult> results, int availableTokens) {
    int maxChunks = calculateMaxChunks(availableTokens);
    // Clamp between 1 and 5
    maxChunks = Math.max(1, Math.min(5, maxChunks));
    return results.subList(0, maxChunks);
}
```

## Combined Strategy Implementation

The production implementation combines all strategies:

```java
public ChatRequest buildChatRequest(UserMessage userMessage, Conversation conversation) {
    int modelWindow = getModelContextWindow();
    int availableContext = calculateAvailableContext(modelWindow);
    
    // 1. Start with system prompt
    StringBuilder context = new StringBuilder(systemPrompt);
    
    // 2. Add sticky facts
    if (!stickyFacts.isEmpty()) {
        context.append("\n\nSticky Facts:\n");
        context.append(stickyFactManager.getFormattedFacts());
    }
    
    // 3. Add RAG context if applicable
    if (ragEnabled) {
        List<SearchResult> ragResults = ragService.search(userMessage.getText());
        List<SearchResult> adaptedResults = adaptRagContext(ragResults, availableContext);
        context.append("\n\nRelevant Context:\n");
        context.append(formatRagResults(adaptedResults));
    }
    
    // 4. Apply sliding window to conversation history
    List<Message> history = applySlidingWindow(conversation.getMessages(), 20, 4000);
    
    // 5. Apply summary if still over budget
    if (countTokens(context, history) > availableContext) {
        history = applySummaryStrategy(history);
    }
    
    return new ChatRequest(context.toString(), history, userMessage);
}
```

## Best Practices

1. **Monitor Token Usage**: Log token counts for debugging and optimization
2. **Test Edge Cases**: Verify behavior when context is nearly full
3. **User Feedback**: Inform users when context is being truncated
4. **Configurable Limits**: Allow tuning of all thresholds via environment variables
5. **Graceful Degradation**: Never fail due to token limits, always truncate gracefully
