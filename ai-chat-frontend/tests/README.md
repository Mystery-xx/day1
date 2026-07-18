# E2E Playwright Tests - RAG Pipeline

This directory contains end-to-end tests for the RAG (Retrieval-Augmented Generation) pipeline.

## Prerequisites

1. **Docker containers must be running**:
   ```bash
   # From project root
   docker-compose up --build
   ```
   
   The tests expect:
   - Frontend running on `http://localhost:5173`
   - Backend API available at `http://localhost:5173/api` (via Vite proxy)

2. **Playwright installed**:
   ```bash
   npm install
   npx playwright install chromium
   ```

## Running Tests

### Run all tests
```bash
npm run test:e2e
# or
npx playwright test
```

### Run with UI
```bash
npm run test:e2e:ui
```

### Run in debug mode
```bash
npm run test:e2e:debug
```

### Run specific test
```bash
npx playwright test --grep "RAG full pipeline"
npx playwright test --grep "invalid file type"
npx playwright test --grep "file too large"
```

### Run with specific browser
```bash
npx playwright test --project chromium
```

## Test Files

### `rag-e2e.spec.ts`

Contains 4 test scenarios:

1. **RAG full pipeline: upload → search → verify**
   - Uploads `test.md` with SEMANTIC strategy
   - Verifies success message
   - Searches for keyword via API
   - Validates search results contain expected content
   - Saves screenshot to `.omo/evidence/`

2. **Negative: invalid file type**
   - Attempts to upload a `.pdf` file
   - Verifies error message is shown
   - Confirms file input is cleared
   - Saves screenshot of error

3. **Negative: file too large**
   - Attempts to upload file > 10MB
   - Verifies error message mentions size limit
   - Confirms file input is cleared
   - Saves screenshot of error

4. **RAG pipeline with FIXED_SIZE strategy**
   - Uploads `test.md` with FIXED_SIZE strategy
   - Verifies success message mentions FIXED_SIZE
   - Validates search functionality
   - Saves screenshot

## Test Fixtures

Located in `tests/fixtures/`:

- `test.md` - Test document with unique keywords for RAG search validation
- `large_file.txt` - 11MB file for testing size validation

## Output

Test artifacts are saved to `../../.omo/evidence/`:

- Screenshots on failure (configured in `playwright.config.ts`)
- Test reports (HTML format)

## Troubleshooting

### Tests fail with timeout
- Ensure Docker containers are running: `docker-compose ps`
- Check backend logs: `docker logs ai-chat-backend`
- Verify frontend is accessible: `http://localhost:5173`

### API errors
- Check RAG endpoints are available:
  ```bash
  curl http://localhost:5173/api/rag/search?query=test&topK=5
  ```
- Verify Ollama is running with `nomic-embed-text` model

### File upload fails
- Ensure test fixtures exist: `ls tests/fixtures/`
- Check file permissions
- Verify backend accepts multipart/form-data

## CI/CD Integration

For CI environments, the tests will:
- Run in serial (not parallel)
- Retry failed tests 2 times
- Generate HTML report

```bash
# CI mode
CI=true npm run test:e2e
```
