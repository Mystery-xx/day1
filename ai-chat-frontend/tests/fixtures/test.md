# Test Document for RAG Pipeline

## Introduction

This is a test document created specifically for E2E testing of the RAG (Retrieval-Augmented Generation) pipeline.

## Key Features

### Semantic Chunking

The document structure is designed to test semantic chunking by headers:
- Level 1 headers (single #) create major sections
- Level 2 headers (##) create subsections
- Level 3 headers (###) create detailed breakdowns

### Search Keywords

This document contains several unique keywords for testing search functionality:

1. **RAG_PIPELINE_TEST** - Unique identifier for this test document
2. **SEMANTIC_SEARCH_VALIDATION** - Keyword for validating semantic search
3. **FIXED_SIZE_TEST_MARKER** - Marker for fixed-size chunking tests

## Test Content

The RAG system should be able to:
- Upload this document successfully
- Chunk it according to the selected strategy (SEMANTIC or FIXED_SIZE)
- Generate embeddings for each chunk
- Store chunks in the vector database
- Retrieve relevant chunks when searching for keywords
- Return results with similarity scores

## Expected Behavior

When searching for "RAG_PIPELINE_TEST", the system should:
- Return chunks containing this keyword
- Provide similarity scores above 0.7
- Include metadata about the source document

When searching for "semantic chunking", the system should:
- Return the Introduction section
- Include information about header-based splitting

## Conclusion

This test document validates the complete RAG indexing and search pipeline.

---

**Test Metadata:**
- Created: E2E Test Suite
- Purpose: RAG Pipeline Validation
- Keywords: RAG_PIPELINE_TEST, SEMANTIC_SEARCH_VALIDATION, FIXED_SIZE_TEST_MARKER
