# Model Settings Guide

## Overview

AI model behavior can be fine-tuned through various generation parameters. Understanding these settings allows you to optimize the AI Chat application for different use cases, from creative brainstorming to precise factual responses.

## Core Parameters

### Temperature

**Range:** 0.0 to 2.0  
**Default:** 0.7  
**Effect:** Controls randomness in token selection

Temperature affects how the model chooses the next token during generation. Higher values increase randomness, while lower values make the model more deterministic.

**Behavior by Range:**

| Temperature | Behavior | Use Case |
|-------------|----------|----------|
| 0.0-0.3 | Highly deterministic, picks most likely token | Code generation, factual Q&A, data extraction |
| 0.4-0.7 | Balanced, moderate creativity | General conversation, assistance tasks |
| 0.8-1.2 | Creative, varied responses | Brainstorming, creative writing, ideation |
| 1.3-2.0 | Highly random, may produce incoherent output | Experimental, artistic generation |

**Technical Details:**
```
P(token) = softmax(logits / temperature)
```

Lower temperature sharpens the probability distribution, making high-probability tokens more likely. Higher temperature flattens the distribution, giving low-probability tokens a better chance.

**Example:**
```json
{
  "model": "qwen3.5-397b-a17b",
  "messages": [...],
  "temperature": 0.3
}
```

**Recommendations:**
- **Customer Support Bot**: 0.3-0.5 (consistent, reliable responses)
- **Creative Writing Assistant**: 0.8-1.0 (varied, imaginative output)
- **Code Assistant**: 0.2-0.4 (precise, syntactically correct code)
- **General Chat**: 0.7 (default, good balance)

---

### Top_P (Nucleus Sampling)

**Range:** 0.0 to 1.0  
**Default:** 0.9  
**Effect:** Limits token selection to top probability mass

Top_P sampling considers only the smallest set of tokens whose cumulative probability exceeds P. This is an alternative to temperature that dynamically adjusts the number of candidates.

**Behavior by Range:**

| Top_P | Candidates | Use Case |
|-------|------------|----------|
| 0.1-0.5 | Very few high-probability tokens | Factual accuracy, strict formatting |
| 0.6-0.8 | Moderate candidate pool | Standard conversation |
| 0.9-1.0 | Large candidate pool | Creative tasks, varied output |

**Technical Details:**
```
Select smallest set S where sum(P(token) for token in S) >= top_p
Sample next token from S
```

**Example:**
```json
{
  "model": "qwen3.5-397b-a17b",
  "messages": [...],
  "top_p": 0.85
}
```

**Temperature vs Top_P:**
- Use **temperature** for general creativity control
- Use **top_p** when you want to strictly limit the candidate pool
- Can be used together, but effects may overlap

**Recommendations:**
- **Combined with low temp (0.3)**: Set top_p to 0.8-0.9
- **Combined with high temp (1.0)**: Set top_p to 0.9-0.95
- **Standalone**: 0.9 is a good default

---

### Frequency Penalty

**Range:** -2.0 to 2.0  
**Default:** 0.0  
**Effect:** Reduces repetition by penalizing frequently used tokens

Positive values decrease the likelihood of tokens that have already appeared frequently in the generated text. This helps prevent looping and repetitive phrasing.

**Behavior by Range:**

| Penalty | Effect |
|---------|--------|
| -2.0 to -0.5 | Encourages repetition (rarely useful) |
| -0.5 to 0.5 | Minimal effect |
| 0.5 to 1.5 | Moderate repetition reduction |
| 1.5 to 2.0 | Strong repetition avoidance |

**Technical Details:**
```
adjusted_logit(token) = original_logit(token) - frequency_penalty * count(token)
```

**Example:**
```json
{
  "model": "qwen3.5-397b-a17b",
  "messages": [...],
  "frequency_penalty": 0.5
}
```

**Use Cases:**
- **Long-form content**: 0.5-1.0 (prevents repetitive phrasing)
- **Technical documentation**: 0.3-0.5 (mild repetition control)
- **Short responses**: 0.0 (not needed for brief output)

---

### Presence Penalty

**Range:** -2.0 to 2.0  
**Default:** 0.0  
**Effect:** Encourages new topics by penalizing tokens that have appeared

Unlike frequency penalty (which considers count), presence penalty applies a flat penalty to any token that has appeared at least once. This encourages the model to introduce new concepts.

**Behavior by Range:**

| Penalty | Effect |
|---------|--------|
| -2.0 to -0.5 | Encourages staying on same topic |
| -0.5 to 0.5 | Minimal effect |
| 0.5 to 1.5 | Encourages topic diversity |
| 1.5 to 2.0 | Strong push toward new topics |

**Technical Details:**
```
adjusted_logit(token) = original_logit(token) - presence_penalty * (1 if count(token) > 0 else 0)
```

**Example:**
```json
{
  "model": "qwen3.5-397b-a17b",
  "messages": [...],
  "presence_penalty": 0.3
}
```

**Use Cases:**
- **Brainstorming sessions**: 0.5-1.0 (encourages diverse ideas)
- **Focused Q&A**: 0.0-0.2 (stay on topic)
- **Creative exploration**: 0.3-0.7 (balance of focus and variety)

---

### Max Tokens

**Range:** 1 to model-specific maximum  
**Default:** 1024  
**Effect:** Hard limit on response length

This parameter sets the maximum number of tokens the model can generate in a single response. Once this limit is reached, generation stops regardless of whether the response is complete.

**Considerations:**

| Max Tokens | Response Length | Use Case |
|------------|-----------------|----------|
| 50-100 | 1-2 sentences | Quick answers, confirmations |
| 100-300 | 1 paragraph | Standard responses |
| 300-500 | 2-3 paragraphs | Detailed explanations |
| 500-1000 | Multiple paragraphs | Long-form content |
| 1000+ | Essays, articles | Comprehensive documentation |

**Token to Word Conversion:**
- English: ~1 token ≈ 0.75 words
- 100 tokens ≈ 75 words
- 1000 tokens ≈ 750 words

**Example:**
```json
{
  "model": "qwen3.5-397b-a17b",
  "messages": [...],
  "max_tokens": 500
}
```

**Important Notes:**
- Does not guarantee the response will be this long
- Model may stop earlier if it reaches a natural conclusion
- Setting too low may truncate mid-sentence
- Setting too high wastes tokens if response is short

---

### Stop Sequences

**Type:** Array of strings  
**Default:** None  
**Effect:** Generation stops when any stop sequence is encountered

Stop sequences allow you to define custom endpoints for generation. This is useful for controlling output format or preventing the model from continuing beyond a desired point.

**Common Use Cases:**

**1. Single-Line Responses:**
```json
{
  "stop": ["\n"]
}
```

**2. Preventing Model from Writing User Message:**
```json
{
  "stop": ["User:", "Human:", "Question:"]
}
```

**3. Structured Output Delimiters:**
```json
{
  "stop": ["```", "END", "###"]
}
```

**Example:**
```json
{
  "model": "qwen3.5-397b-a17b",
  "messages": [...],
  "stop": ["\n\n", "User:"]
}
```

**Best Practices:**
- Use sequences that are unlikely to appear in normal content
- Keep stop sequences short (1-10 characters)
- Test thoroughly to avoid premature truncation
- Consider model-specific tokenization quirks

---

## Recommended Configurations by Use Case

### Factual Q&A

```json
{
  "temperature": 0.3,
  "top_p": 0.85,
  "frequency_penalty": 0.0,
  "presence_penalty": 0.0,
  "max_tokens": 300
}
```

**Rationale:** Low temperature ensures accurate, consistent answers. Moderate top_p allows some flexibility in phrasing.

### Creative Writing

```json
{
  "temperature": 0.9,
  "top_p": 0.95,
  "frequency_penalty": 0.5,
  "presence_penalty": 0.3,
  "max_tokens": 1000
}
```

**Rationale:** High temperature and top_p encourage creativity. Penalties prevent repetitive phrasing in long-form content.

### Code Generation

```json
{
  "temperature": 0.2,
  "top_p": 0.8,
  "frequency_penalty": 0.0,
  "presence_penalty": 0.0,
  "max_tokens": 500,
  "stop": ["```"]
}
```

**Rationale:** Very low temperature ensures syntactically correct code. Stop sequence prevents model from continuing beyond code block.

### Brainstorming

```json
{
  "temperature": 1.0,
  "top_p": 0.95,
  "frequency_penalty": 0.7,
  "presence_penalty": 0.5,
  "max_tokens": 800
}
```

**Rationale:** High settings encourage diverse ideas. Penalties prevent fixation on single concepts.

### Customer Support

```json
{
  "temperature": 0.5,
  "top_p": 0.9,
  "frequency_penalty": 0.3,
  "presence_penalty": 0.1,
  "max_tokens": 400
}
```

**Rationale:** Balanced settings for friendly but consistent responses. Mild penalties avoid robotic repetition.

---

## Environment Variable Configuration

Model settings can be configured via environment variables:

```bash
# In .env file
AI_MODEL_TEMPERATURE=0.7
AI_MODEL_TOP_P=0.9
AI_MODEL_FREQUENCY_PENALTY=0.0
AI_MODEL_PRESENCE_PENALTY=0.0
AI_MODEL_MAX_TOKENS=1024
```

These values are loaded by the backend and applied to all chat requests unless overridden by the frontend.

---

## Testing and Tuning

### A/B Testing Approach

1. Start with recommended defaults for your use case
2. Make single-parameter changes (isolate effects)
3. Generate 5-10 sample responses per configuration
4. Rate responses on relevant criteria (accuracy, creativity, coherence)
5. Iterate toward optimal settings

### Logging for Analysis

Enable request/response logging to analyze parameter effects:

```yaml
# application.yml
logging:
  level:
    com.aichat.service: DEBUG
```

Review logs to see:
- Actual parameters sent to AI API
- Response lengths and token usage
- Generation patterns and quality
