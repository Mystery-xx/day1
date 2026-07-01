import { test, expect } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

// Test fixtures paths (ES module compatible)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURES_DIR = path.join(__dirname, 'fixtures')
const EVIDENCE_DIR = path.join(__dirname, '../../.omo/evidence')

// Ensure evidence directory exists
if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
}

test.describe('RAG E2E Pipeline Tests', () => {
  // Configure timeout for slow operations
  test.setTimeout(90000)

  test.beforeEach(async ({ page }) => {
    // Set viewport for consistent screenshots
    await page.setViewportSize({ width: 1280, height: 720 })
  })

  test('RAG full pipeline: upload → search → verify', async ({ page }) => {
    const testFileName = 'test.md'
    const testFilePath = path.join(FIXTURES_DIR, testFileName)
    const screenshotPath = path.join(EVIDENCE_DIR, 'rag-pipeline-success.png')

    console.log(`📁 Using test fixture: ${testFilePath}`)
    console.log(`📸 Screenshot will be saved to: ${screenshotPath}`)

    // Step 1: Navigate to Settings → Upload tab
    console.log('📍 Step 1: Navigating to Settings page...')
    await page.goto('/settings')
    await expect(page).toHaveURL(/.*settings/)
    
    // Verify Upload tab is visible and active
    const uploadTab = page.getByRole('button', { name: '📤 Upload', exact: true })
    await expect(uploadTab).toBeVisible()
    
    // Click on Upload tab if not already active
    const uploadTabActive = await page.locator('.settings-tabs button:has-text("📤 Upload")').getAttribute('style')
    if (!uploadTabActive?.includes('border-bottom: 2px solid #4CAF50')) {
      await uploadTab.click()
    }

    // Step 2: Upload test.md with SEMANTIC strategy
    console.log('📤 Step 2: Uploading test.md with SEMANTIC strategy...')
    
    // Select SEMANTIC strategy
    const strategySelect = page.locator('#strategy-select')
    await strategySelect.selectOption('SEMANTIC')
    await expect(strategySelect).toHaveValue('SEMANTIC')

    // Upload file
    const fileInput = page.locator('#file-upload')
    await fileInput.setInputFiles(testFilePath)
    
    // Verify file is selected
    const selectedFile = page.locator('.selected-file')
    await expect(selectedFile).toBeVisible()
    await expect(selectedFile).toContainText(testFileName)

    // Click upload button
    const uploadButton = page.locator('button:has-text("📤 Upload Document")')
    await uploadButton.click()

    // Wait for upload to complete (progress bar should reach 100%)
    const progressBar = page.locator('.upload-progress')
    await expect(progressBar).toBeVisible({ timeout: 30000 })
    
    // Wait for success message
    const successMessage = page.locator('.upload-success')
    await expect(successMessage).toBeVisible({ timeout: 60000 })
    
    // Verify success message contains expected text
    await expect(successMessage).toContainText('Upload Successful')
    await expect(successMessage).toContainText(/Created \d+ chunk\(s\)/)
    await expect(successMessage).toContainText('SEMANTIC')

    // Take screenshot of successful upload
    await page.screenshot({ path: screenshotPath, fullPage: false })
    console.log(`✅ Screenshot saved: ${screenshotPath}`)

    // Step 3: Navigate to Search tab (if exists) or verify via API
    console.log('🔍 Step 3: Verifying search functionality...')
    
    // For now, verify via API call since Search tab may not exist yet
    // In a full implementation, this would navigate to a Search tab
    const searchResponse = await page.request.get('/api/rag/search', {
      params: {
        query: 'RAG_PIPELINE_TEST',
        topK: '5'
      }
    })
    
    expect(searchResponse.ok()).toBeTruthy()
    const searchResults = await searchResponse.json()
    
    // Verify results contain expected content
    expect(searchResults).toHaveProperty('query')
    expect(searchResults).toHaveProperty('results')
    expect(Array.isArray(searchResults.results)).toBeTruthy()
    expect(searchResults.results.length).toBeGreaterThan(0)
    
    // Verify at least one result contains the search term
    const foundMatch = searchResults.results.some((result: any) => 
      result.content?.includes('RAG_PIPELINE_TEST')
    )
    expect(foundMatch).toBeTruthy()

    console.log('✅ RAG full pipeline test passed!')
  })

  test('Negative: invalid file type', async ({ page }) => {
    const testFileName = 'invalid_file.pdf'
    const testFilePath = path.join(FIXTURES_DIR, testFileName)
    const screenshotPath = path.join(EVIDENCE_DIR, 'invalid-file-type-error.png')

    console.log(`❌ Testing invalid file type: ${testFileName}`)

    // Create a dummy PDF file for testing
    if (!fs.existsSync(testFilePath)) {
      // Create a minimal PDF file (just header to simulate PDF)
      fs.writeFileSync(testFilePath, '%PDF-1.4\nThis is a fake PDF for testing')
    }

    // Navigate to Settings → Upload tab
    await page.goto('/settings')
    await expect(page.getByRole('button', { name: '📤 Upload', exact: true })).toBeVisible()

    // Try to upload PDF file
    const fileInput = page.locator('#file-upload')
    await fileInput.setInputFiles(testFilePath)

    // Wait for error message to appear
    const errorMessage = page.locator('.upload-error')
    await expect(errorMessage).toBeVisible({ timeout: 5000 })
    
    // Verify error message contains expected text
    await expect(errorMessage).toContainText('Invalid file type')
    await expect(errorMessage).toContainText('.txt or .md')

    // Take screenshot of error
    await page.screenshot({ path: screenshotPath })
    console.log(`✅ Screenshot saved: ${screenshotPath}`)

    // Verify file input is cleared
    const selectedFile = page.locator('.selected-file')
    await expect(selectedFile).not.toBeVisible()

    console.log('✅ Invalid file type test passed!')
  })

  test('Negative: file too large', async ({ page }) => {
    const testFileName = 'large_file.txt'
    const testFilePath = path.join(FIXTURES_DIR, testFileName)
    const screenshotPath = path.join(EVIDENCE_DIR, 'file-too-large-error.png')

    console.log(`❌ Testing file size validation: ${testFileName}`)

    // Verify the large file exists
    if (!fs.existsSync(testFilePath)) {
      console.error(`⚠️ Large file not found at ${testFilePath}`)
      throw new Error('Large test file not found. Run setup first.')
    }

    const fileSize = fs.statSync(testFilePath).size
    console.log(`📊 File size: ${(fileSize / (1024 * 1024)).toFixed(2)} MB`)
    expect(fileSize).toBeGreaterThan(10 * 1024 * 1024) // > 10MB

    // Navigate to Settings → Upload tab
    await page.goto('/settings')
    await expect(page.getByRole('button', { name: '📤 Upload', exact: true })).toBeVisible()

    // Try to upload large file
    const fileInput = page.locator('#file-upload')
    await fileInput.setInputFiles(testFilePath)

    // Wait for error message to appear
    const errorMessage = page.locator('.upload-error')
    await expect(errorMessage).toBeVisible({ timeout: 5000 })
    
    // Verify error message contains expected text
    await expect(errorMessage).toContainText('File size exceeds')
    await expect(errorMessage).toContainText('10MB')

    // Take screenshot of error
    await page.screenshot({ path: screenshotPath })
    console.log(`✅ Screenshot saved: ${screenshotPath}`)

    // Verify file input is cleared
    const selectedFile = page.locator('.selected-file')
    await expect(selectedFile).not.toBeVisible()

    console.log('✅ File too large test passed!')
  })

  test('RAG pipeline with FIXED_SIZE strategy', async ({ page }) => {
    const testFileName = 'test.md'
    const testFilePath = path.join(FIXTURES_DIR, testFileName)
    const screenshotPath = path.join(EVIDENCE_DIR, 'fixed-size-strategy.png')

    console.log('📤 Testing FIXED_SIZE chunking strategy...')

    // Navigate to Settings → Upload tab
    await page.goto('/settings')
    await expect(page.getByRole('button', { name: '📤 Upload', exact: true })).toBeVisible()

    // Select FIXED_SIZE strategy
    const strategySelect = page.locator('#strategy-select')
    await strategySelect.selectOption('FIXED_SIZE')
    await expect(strategySelect).toHaveValue('FIXED_SIZE')

    // Upload file
    const fileInput = page.locator('#file-upload')
    await fileInput.setInputFiles(testFilePath)
    
    // Verify file is selected
    await expect(page.locator('.selected-file')).toBeVisible()

    // Click upload button
    const uploadButton = page.locator('button:has-text("📤 Upload Document")')
    await uploadButton.click()

    // Wait for success message
    const successMessage = page.locator('.upload-success')
    await expect(successMessage).toBeVisible({ timeout: 60000 })
    
    // Verify success message mentions FIXED_SIZE
    await expect(successMessage).toContainText('FIXED_SIZE')

    // Take screenshot
    await page.screenshot({ path: screenshotPath })
    console.log(`✅ Screenshot saved: ${screenshotPath}`)

    // Verify via API
    const searchResponse = await page.request.get('/api/rag/search', {
      params: {
        query: 'Test Document for RAG Pipeline',
        topK: '5'
      }
    })
    
    expect(searchResponse.ok()).toBeTruthy()
    const searchResults = await searchResponse.json()
    expect(searchResults.results.length).toBeGreaterThan(0)

    console.log('✅ FIXED_SIZE strategy test passed!')
  })
})
