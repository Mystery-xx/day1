# RAG Comparison Report

**Test Date**: 2026-07-05T21:35:00Z  
**Total Questions**: 10  
**Test Configuration**: RAG ON vs RAG OFF comparison

## Summary Table

| # | Question | RAG OFF Accuracy | RAG ON Accuracy | Improvement | Sources | Hallucinations |
|---|----------|------------------|-----------------|-------------|---------|----------------|
| 1 | MCP Server Configuration | 60% | 0% | -60% | NO | 0 |
| 2 | RAG Chunking Strategies | 50% | 0% | -50% | NO | 0 |
| 3 | Docker Port Mapping | 70% | 0% | -70% | NO | 0 |
| 4 | Required Environment Variables | 65% | 0% | -65% | NO | 0 |
| 5 | Context Management Strategies | 55% | 0% | -55% | NO | 0 |
| 6 | MCP Connection Troubleshooting | 75% | 0% | -75% | NO | 0 |
| 7 | Model Temperature Settings | 80% | 0% | -80% | NO | 0 |
| 8 | API Key Security | 70% | 0% | -70% | NO | 0 |
| 9 | Chat API Endpoints | 60% | 0% | -60% | NO | 0 |
| 10 | Vector Storage Architecture | 75% | 0% | -75% | NO | 0 |
| **AVG** | **Overall** | **66%** | **0%** | **-66%** | **NO** | **0** |

## Accuracy Breakdown by Difficulty

| Difficulty | Questions | RAG OFF Avg | RAG ON Avg | Delta |
|------------|-----------|-------------|------------|-------|
| Easy (Q1, Q3, Q4, Q9) | 4 | 64% | 0% | -64% |
| Medium (Q2, Q5, Q6, Q7, Q8) | 5 | 66% | 0% | -66% |
| Hard (Q10) | 1 | 75% | 0% | -75% |

## Source Citation Analysis

| Metric | RAG OFF | RAG ON | Expected |
|--------|---------|--------|----------|
| Questions with sources | 0/10 | 0/10 | 10/10 |
| Correct document cited | N/A | 0/10 | 10/10 |
| Wrong document retrieved | N/A | 10/10 | 0/10 |
| Sources from tech docs | 0 | 0 | 10 |

## Hallucination Analysis

| Question | RAG OFF Hallucinations | RAG ON Hallucinations | Notes |
|----------|------------------------|-----------------------|-------|
| Q1 | 0 | 0 | Both acknowledged uncertainty |
| Q2 | 0 | 0 | Both marked speculation |
| Q3 | 0 | 0 | General knowledge only |
| Q4 | 0 | 0 | No false claims |
| Q5 | 0 | 0 | Honest about limitations |
| Q6 | 0 | 0 | Troubleshooting based on experience |
| Q7 | 0 | 0 | Standard ML knowledge |
| Q8 | 0 | 0 | Security best practices |
| Q9 | 0 | 0 | Asked for clarification |
| Q10 | 0 | 0 | Generic vector DB explanation |
| **Total** | **0** | **0** | **No hallucinations detected** |

## Document Retrieval Failure Analysis

| Question | Expected Source | Actual Retrieved | Match |
|----------|-----------------|------------------|-------|
| Q1 | 02-mcp-setup-guide.md | Золотой ключик | NO |
| Q2 | 06-rag-architecture.md | Золотой ключик | NO |
| Q3 | 05-docker-deployment.md | Золотой ключик | NO |
| Q4 | 04-environment-variables.md | Золотой ключик | NO |
| Q5 | 07-context-strategies.md | Золотой ключик | NO |
| Q6 | 08-troubleshooting.md | Золотой ключик | NO |
| Q7 | 09-model-settings.md | Золотой ключик | NO |
| Q8 | 10-security-guide.md | Золотой ключик | NO |
| Q9 | 03-api-reference.md | Золотой ключик | NO |
| Q10 | 06-rag-architecture.md | Золотой ключик | NO |

## Recommendations Priority Matrix

| Priority | Action | Effort | Impact | Owner |
|----------|--------|--------|--------|-------|
| P0 | Clear vector index | Low | High | DevOps |
| P0 | Re-upload technical docs | Low | High | Dev |
| P1 | Add index validation endpoint | Medium | High | Backend |
| P1 | Implement test index isolation | Medium | High | QA |
| P2 | Add document metadata tracking | Medium | Medium | Backend |
| P2 | Create index health dashboard | High | Medium | Frontend |
| P3 | Automated pre-test validation | Low | Medium | CI/CD |

## Detailed Analysis

### Question 1: MCP Server Configuration

**Вопрос**: Какие три обязательных поля требуются для настройки MCP сервера?

**Ожидаемый ответ**: name, url, transportType (HTTP или STDIO)

**RAG OFF**:
- Answer quality: 60% (correctly identified MCP as Model Context Protocol, speculated about name/command/args fields)
- Hallucinations: 0 (clearly marked uncertainty)
- Sources: N/A

**RAG ON**:
- Answer quality: 0% (retrieved "Золотой ключик" literary text, explicitly stated no MCP information found)
- Hallucinations: 0 (correctly identified mismatch)
- Sources: NO (wrong document type)

**Issue**: RAG retrieved literary text instead of technical documentation (02-mcp-setup-guide.md)

---

### Question 2: RAG Chunking Strategies

**Вопрос**: Какие две стратегии чанкинга документов поддерживает RAG система?

**Ожидаемый ответ**: SEMANTIC (по семантическим границам), FIXED_SIZE (512 токенов с перекрытием 50)

**RAG OFF**:
- Answer quality: 50% (mentioned Fixed-size vs Semantic correctly, but details were generic)
- Hallucinations: 0
- Sources: N/A

**RAG ON**:
- Answer quality: 0% (retrieved Buratino story, stated no RAG information)
- Hallucinations: 0
- Sources: NO

**Issue**: Vector index contains wrong documents (literary text instead of 06-rag-architecture.md)

---

### Question 3: Docker Port Mapping

**Вопрос**: Какие порты используются в стандартной конфигурации docker-compose.yml?

**Ожидаемый ответ**: Backend: 8082→8082, Frontend: 80→5173, Network: ai-chat-network

**RAG OFF**:
- Answer quality: 70% (explained common conventions, mentioned typical ports but not exact values)
- Hallucinations: 0
- Sources: N/A

**RAG ON**:
- Answer quality: 0% (stated no port information in provided context)
- Hallucinations: 0
- Sources: NO

**Issue**: RAG search returned irrelevant literary content instead of docker-compose.yml or 05-docker-deployment.md

---

### Question 4: Required Environment Variables

**Вопрос**: Какие три переменные окружения являются обязательными для запуска приложения?

**Ожидаемый ответ**: AI_API_KEY, AI_API_URL, AI_MODEL (all required)

**RAG OFF**:
- Answer quality: 65% (discussed common variables like PATH, HOME, but not project-specific)
- Hallucinations: 0
- Sources: N/A

**RAG ON**:
- Answer quality: 0% (retrieved Buratino text, no environment variable information)
- Hallucinations: 0
- Sources: NO

**Issue**: Wrong document indexing - should have 04-environment-variables.md

---

### Question 5: Context Management Strategies

**Вопрос**: Какие три стратегии управления контекстом реализованы в AI Chat?

**Ожидаемый ответ**: Sliding Window (20 сообщений, 4000 токенов), Sticky Facts, Summary

**RAG OFF**:
- Answer quality: 55% (mentioned Sliding Window, Summarization, RAG - close but not exact)
- Hallucinations: 0
- Sources: N/A

**RAG ON**:
- Answer quality: 0% (stated no information about AI Chat strategies)
- Hallucinations: 0
- Sources: NO

**Issue**: RAG retrieved literary text instead of 07-context-strategies.md

---

### Question 6: MCP Connection Troubleshooting

**Вопрос**: Что делать если MCP сервер не подключается из Docker контейнера?

**Ожидаемый ответ**: Использовать host.docker.internal, проверить extra_hosts, docker exec curl, проверить логи

**RAG OFF**:
- Answer quality: 75% (comprehensive troubleshooting guide, correctly mentioned host.docker.internal)
- Hallucinations: 0
- Sources: N/A

**RAG ON**:
- Answer quality: 0% (general MCP troubleshooting but no specific context from docs)
- Hallucinations: 0
- Sources: NO

**Issue**: RAG should have retrieved 08-troubleshooting.md but got literary text

---

### Question 7: Model Temperature Settings

**Вопрос**: Как влияет параметр temperature на генерацию и какие значения для code generation?

**Ожидаемый ответ**: Temperature 0.0-2.0, низкие значения (0.2-0.4) для кода, default 0.7

**RAG OFF**:
- Answer quality: 80% (correctly explained temperature effect, recommended 0.0-0.3 for code)
- Hallucinations: 0
- Sources: N/A

**RAG ON**:
- Answer quality: 0% (answered from general knowledge, acknowledged context mismatch)
- Hallucinations: 0
- Sources: NO

**Issue**: No technical documentation retrieved (should be 09-model-settings.md)

---

### Question 8: API Key Security

**Вопрос**: Как обеспечивается безопасность API ключей в приложении?

**Ожидаемый ответ**: .env файл в .gitignore, Docker environment variables, Bearer authentication, chmod 600

**RAG OFF**:
- Answer quality: 70% (comprehensive security practices, mentioned env vars, secret managers)
- Hallucinations: 0
- Sources: N/A

**RAG ON**:
- Answer quality: 0% (stated context is Buratino story, no security info)
- Hallucinations: 0
- Sources: NO

**Issue**: RAG retrieved wrong documents instead of 10-security-guide.md

---

### Question 9: Chat API Endpoints

**Вопрос**: Какие endpoints доступны для работы с чатом и какие HTTP методы используются?

**Ожидаемый ответ**: POST /api/chat, GET /api/chat/health, stream=true/false параметр

**RAG OFF**:
- Answer quality: 60% (asked for clarification, gave examples from popular APIs)
- Hallucinations: 0
- Sources: N/A

**RAG ON**:
- Answer quality: 0% (acknowledged context mismatch - literary text)
- Hallucinations: 0
- Sources: NO

**Issue**: Should have retrieved 03-api-reference.md but got literary content

---

### Question 10: Vector Storage Architecture

**Вопрос**: Как работает векторное хранилище в RAG системе и где хранятся данные?

**Ожидаемый ответ**: In-memory HNSW индекс, Cosine similarity, persistence в /data/rag-index/vectors.dat

**RAG OFF**:
- Answer quality: 75% (explained RAG vector storage well, mentioned HNSW, examples of vector DBs)
- Hallucinations: 0
- Sources: N/A

**RAG ON**:
- Answer quality: 0% (general explanation, no specific architecture from docs)
- Hallucinations: 0
- Sources: NO

**Issue**: RAG should have retrieved 06-rag-architecture.md but got literary text

---

## Conclusions

### RAG Effectiveness

| Metric | Value |
|--------|-------|
| **Questions where RAG helped** | 0/10 (0%) |
| **Questions where RAG hurt** | 10/10 (100%) |
| **Average accuracy RAG OFF** | 66% |
| **Average accuracy RAG ON** | 0% |
| **Net improvement** | -66% |

### Root Cause Analysis

**CRITICAL ISSUE: Vector Index Contamination**

1. **Wrong document retrieval**: RAG search consistently returns excerpts from "Золотой ключик, или Приключения Буратино" instead of technical documentation files.

2. **Expected vs Actual Index Content**:
   - **Expected**: 10 technical markdown files (01-intro.md through 10-security-guide.md)
   - **Actual**: Literary text (Buratino story)

3. **Possible Causes**:
   - **Test document cleanup failure**: Previous test runs may have indexed literary text and it was never deleted
   - **Wrong upload source**: Test upload may have pointed to wrong directory
   - **Index persistence**: Vector index persisted across test runs without proper reset
   - **Missing document upload**: Technical documentation may never have been uploaded to RAG index

4. **Evidence from Test Results**:
   - All 10 RAG ON responses explicitly mention "Золотой ключик" or "Буратино"
   - All RAG ON responses state they cannot find relevant technical information
   - No RAG ON response cites any technical source (all show "Источники: нет")

### Why RAG OFF Performed Better

RAG OFF answers scored 66% average because:
- Model used general technical knowledge from training
- Answers were honest about uncertainty (no false confidence)
- No hallucinations - model clearly marked speculation
- General knowledge about MCP, Docker, RAG, security is well-represented in training data

RAG ON scored 0% because:
- Retrieved context was completely irrelevant (literary fiction)
- Model correctly identified the mismatch
- No technical information could be extracted from Buratino story
- RAG system failed at the retrieval stage

---

## Recommendations

### Immediate Actions

1. **Clear Vector Index**
   ```bash
   # Delete all indexed documents
   curl -X DELETE http://localhost:8082/api/rag/documents/test.md
   # Or reset entire index (if endpoint exists)
   curl -X POST http://localhost:8082/api/rag/reset
   ```

2. **Verify Document Upload**
   ```bash
   # Check what's indexed
   curl http://localhost:8082/api/rag/statistics
   
   # Expected: 10 technical documents
   # If shows literary text - re-upload required
   ```

3. **Test RAG Search Directly**
   ```bash
   # Before running full tests, verify retrieval works
   curl "http://localhost:8082/api/rag/search?query=MCP+server+configuration&topK=3"
   
   # Expected: chunks from 02-mcp-setup-guide.md
   # If returns Buratino text - index is contaminated
   ```

4. **Add Document Metadata Tracking**
   - Record upload timestamp for each document
   - Track source file path
   - Add document type tag (technical vs non-technical)
   - Implement document versioning

### Process Improvements

5. **Pre-test Index Validation**
   - Add automated check before RAG tests: verify index contains expected documents
   - Fail fast if wrong documents detected
   - Implement index snapshot/restore for testing

6. **Index Isolation for Tests**
   - Use separate index for testing (e.g., `rag-test-index`)
   - Clear and rebuild before each test run
   - Never mix test and production indexes

7. **Document Upload Verification**
   - After upload, immediately search for key terms from document
   - Verify chunk count matches expected
   - Log document metadata (source, strategy, chunk count)

### Technical Fixes

8. **RAG Search Debugging**
   - Add detailed logging to VectorStorageService.similaritySearch()
   - Log query embedding, top K results with scores
   - Include source document names in search response

9. **Index Health Endpoint**
   ```bash
   GET /api/rag/health
   {
     "status": "OK",
     "documentCount": 10,
     "totalChunks": 45,
     "lastUpload": "2026-07-05T20:00:00Z",
     "expectedDocuments": ["01-intro.md", "02-mcp-setup-guide.md", ...]
   }
   ```

---

## Next Steps

1. **Investigate vector index contamination** - Check which documents are actually indexed
2. **Re-upload technical documentation** - Ensure all 10 markdown files are properly chunked and indexed
3. **Re-run RAG tests** - With clean index, compare accuracy again
4. **Implement index validation** - Add pre-test checks to prevent future contamination
5. **Document findings** - Update test procedure to include index verification step

---

## Appendix: Test Data

**Test Execution**: 2026-07-05T21:35:00Z  
**Test File**: /test-results.md  
**Expected Answers**: /test-questions.md  
**Backend**: Spring Boot 3.2 with RAG integration  
**Embedding Model**: nomic-embed-text (via Ollama)  
**Chunking Strategy**: SEMANTIC (default)
