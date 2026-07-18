import { test, expect } from '@playwright/test'

test.describe('Task 10: Task State Management E2E', () => {
  
  test('creates task state with goal', async ({ page }) => {
    console.log('📍 Test 1: Creating task state with goal')
    
    await page.goto('http://localhost:5173/settings')
    await expect(page).toHaveURL(/.*settings/)
    
    await page.waitForSelector('text=Task', { timeout: 10000 })
    const taskTab = page.locator('button:has-text("📋 Task")')
    await taskTab.click()
    
    await page.waitForSelector('text=Task Goal', { timeout: 10000 })
    
    const editButton = page.locator('button:has-text("Edit")')
    await expect(editButton).toBeVisible()
    await editButton.click()
    
    const goalTextarea = page.locator('textarea[placeholder*="Describe the task goal"]')
    await expect(goalTextarea).toBeVisible()
    
    const testGoal = 'Test goal for task state management'
    await goalTextarea.fill(testGoal)
    
    const saveButton = page.locator('button:has-text("Save")').first()
    await saveButton.click()
    
    await page.waitForSelector(`text=${testGoal}`, { timeout: 5000 })
    
    await page.reload()
    await page.waitForSelector('text=Task', { timeout: 10000 })
    await taskTab.click()
    await page.waitForSelector('text=Task Goal', { timeout: 10000 })
    
    const goalDisplay = page.locator('.task-state-panel').filter({ hasText: testGoal })
    await expect(goalDisplay).toBeVisible()
    
    console.log('✅ Test 1 passed: Goal persists after page reload')
  })

  test('updates goal and status', async ({ page }) => {
    console.log('📍 Test 2: Updating goal and status')
    
    await page.goto('http://localhost:5173/settings')
    await page.waitForSelector('text=Task', { timeout: 10000 })
    const taskTab = page.locator('button:has-text("📋 Task")')
    await taskTab.click()
    
    await page.waitForSelector('text=Task Goal', { timeout: 10000 })
    
    const editButton = page.locator('button:has-text("Edit")')
    await editButton.click()
    
    const goalTextarea = page.locator('textarea[placeholder*="Describe the task goal"]')
    const updatedGoal = 'Updated goal for testing'
    await goalTextarea.fill(updatedGoal)
    
    const saveButton = page.locator('button:has-text("Save")').first()
    await saveButton.click()
    await page.waitForSelector(`text=${updatedGoal}`, { timeout: 5000 })
    
    const statusSelect = page.locator('label:has-text("Task Status") + select')
    await expect(statusSelect).toBeVisible()
    await statusSelect.selectOption('EXECUTING')
    
    await page.waitForSelector('text=Running tasks', { timeout: 5000 })
    
    const stateResponse = await page.request.get('/api/chat/sessions/latest/task-state')
    
    if (stateResponse.ok()) {
      const stateData = await stateResponse.json()
      expect(stateData.goal).toContain(updatedGoal)
      expect(stateData.status).toBe('EXECUTING')
    } else {
      await expect(page.locator('text=Updated goal for testing')).toBeVisible()
      await expect(page.locator('text=Executing')).toBeVisible()
    }
    
    console.log('✅ Test 2 passed: Goal and status updated successfully')
  })

  test('adds constraint', async ({ page }) => {
    console.log('📍 Test 3: Adding constraint')
    
    await page.goto('http://localhost:5173/settings')
    await page.waitForSelector('text=Task', { timeout: 10000 })
    const taskTab = page.locator('button:has-text("📋 Task")')
    await taskTab.click()
    
    await page.waitForSelector('text=Constraints', { timeout: 10000 })
    
    const addConstraintButton = page.locator('button:has-text("+ Add Constraint")')
    await addConstraintButton.click()
    
    await page.waitForSelector('text=Add Constraint', { timeout: 5000 })
    
    const typeSelect = page.locator('select').filter({ hasText: /Scope.*Feature/ }).first()
    await typeSelect.selectOption('SCOPE')
    
    const descInput = page.locator('textarea[placeholder*="Describe the constraint"]')
    const constraintDescription = 'Test constraint for E2E validation'
    await descInput.fill(constraintDescription)
    
    const modalAddButton = page.locator('button:has-text("Add Constraint")').last()
    await modalAddButton.click()
    
    await page.waitForSelector(`text=${constraintDescription}`, { timeout: 5000 })
    
    const constraintItem = page.locator('.task-state-panel').filter({ hasText: constraintDescription })
    await expect(constraintItem).toBeVisible()
    await expect(constraintItem).toContainText('Scope')
    
    console.log('✅ Test 3 passed: Constraint added and displayed')
  })

  test('AI receives goal in context', async ({ page }) => {
    console.log('📍 Test 4: AI receives goal in context')
    
    await page.goto('http://localhost:5173/settings')
    await page.waitForSelector('text=Task', { timeout: 10000 })
    const taskTab = page.locator('button:has-text("📋 Task")')
    await taskTab.click()
    
    await page.waitForSelector('text=Task Goal', { timeout: 10000 })
    
    const editButton = page.locator('button:has-text("Edit")')
    await editButton.click()
    
    const goalTextarea = page.locator('textarea[placeholder*="Describe the task goal"]')
    const aiTestGoal = 'Test goal for AI context'
    await goalTextarea.fill(aiTestGoal)
    
    const saveButton = page.locator('button:has-text("Save")').first()
    await saveButton.click()
    await page.waitForSelector(`text=${aiTestGoal}`, { timeout: 5000 })
    
    await page.goto('http://localhost:5173')
    
    const chatInput = page.locator('textarea[placeholder*="message"], input[placeholder*="message"], #chat-input')
    await expect(chatInput).toBeVisible({ timeout: 10000 })
    
    const [chatRequest] = await Promise.all([
      page.waitForRequest(request => 
        request.url().includes('/api/chat') && request.method() === 'POST'
      ),
      async () => {
        await chatInput.fill('Hello, can you help me with my task?')
        
        const sendButton = page.locator('button:has-text("Send"), button:has-text("➤"), #send-button')
        await expect(sendButton).toBeVisible({ timeout: 5000 })
        await sendButton.click()
      }
    ])
    
    const chatResponse = await chatRequest.response()
    expect(chatResponse.ok()).toBeTruthy()
    
    const requestBody = chatRequest.postDataJSON()
    expect(requestBody).toBeDefined()
    
    const hasGoalInRequest = 
      JSON.stringify(requestBody).includes(aiTestGoal) ||
      requestBody.goal === aiTestGoal ||
      requestBody.context?.goal === aiTestGoal
    
    console.log('Chat request body:', JSON.stringify(requestBody, null, 2))
    
    expect(hasGoalInRequest).toBeTruthy()
    
    console.log('✅ Test 4 passed: AI receives goal in context')
  })
})
