const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ 
    executablePath: '/home/solas/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',
    headless: true 
  });
  const page = await browser.newPage();
  
  // Collect console messages
  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });

  // Track network requests
  const apiRequests = [];
  page.on('request', req => {
    if (req.url().includes('/api/')) {
      apiRequests.push({ url: req.url(), method: req.method() });
    }
  });

  const apiResponses = [];
  page.on('response', resp => {
    if (resp.url().includes('/api/')) {
      apiResponses.push({ url: resp.url(), status: resp.status(), method: resp.request().method() });
    }
  });

  try {
    // Step 1: Navigate to support page
    console.log('=== STEP 1: Navigate to /support ===');
    await page.goto('http://localhost:80/support', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    console.log('Page title:', await page.title());
    
    // Check for errors
    console.log('\nConsole errors:');
    consoleLogs.filter(l => l.startsWith('[error]')).forEach(l => console.log('  ', l));
    
    // Step 2: Click "+ Новый тикет" button
    console.log('\n=== STEP 2: Click "+ Новый тикет" ===');
    const newTicketBtn = await page.locator('.ticket-selector-new');
    const btnText = await newTicketBtn.textContent();
    console.log('Button text:', btnText.trim());
    await newTicketBtn.click();
    await page.waitForTimeout(500);
    
    // Step 3: Check form appeared
    console.log('\n=== STEP 3: Check form appeared ===');
    const form = await page.locator('.new-ticket-form');
    const formVisible = await form.isVisible();
    console.log('Form visible:', formVisible);
    
    if (formVisible) {
      // Step 4: Fill the form
      console.log('\n=== STEP 4: Fill form ===');
      await page.fill('#ticket-subject', 'Test');
      console.log('Subject filled: Test');
      
      await page.fill('#ticket-description', 'Testing');
      console.log('Description filled: Testing');
      
      await page.selectOption('#ticket-priority', 'LOW');
      console.log('Priority selected: LOW');
      
      // Take screenshot before submitting
      console.log('\n=== SCREENSHOT ===');
      await page.screenshot({ path: '/tmp/ticket-form-before-submit.png', fullPage: true });
      console.log('Screenshot saved to /tmp/ticket-form-before-submit.png');
      
      // Step 5: Click "Создать" button
      console.log('\n=== STEP 5: Click "Создать" ===');
      
      // Wait for the POST request to complete
      const responsePromise = page.waitForResponse(resp => 
        resp.url().includes('/api/support/tickets') && resp.request().method() === 'POST',
        { timeout: 10000 }
      );
      
      await page.click('.new-ticket-form-submit');
      
      const postResponse = await responsePromise;
      console.log('POST response status:', postResponse.status());
      const responseBody = await postResponse.json();
      console.log('POST response body:', JSON.stringify(responseBody));
      
      // Step 6: Check ticket created and selected
      console.log('\n=== STEP 6: Verify ticket created and selected ===');
      await page.waitForTimeout(1000);
      
      // Check the new ticket appears in the selector
      const selectValue = await page.locator('.ticket-selector-select').inputValue();
      console.log('Selected ticket ID:', selectValue);
      console.log('Selected ticket is null/empty?', !selectValue);
      
      // Check for ticket info panel
      const ticketInfo = await page.locator('.ticket-info');
      const ticketInfoVisible = await ticketInfo.isVisible();
      console.log('Ticket info visible:', ticketInfoVisible);
      
      if (ticketInfoVisible) {
        const subjectText = await page.locator('.ticket-info-subject').textContent();
        console.log('Ticket subject:', subjectText);
      }
      
      // Check for console errors after submission
      console.log('\nConsole errors after submit:');
      consoleLogs.filter(l => l.startsWith('[error]')).forEach(l => console.log('  ', l));
      
      // Final state screenshots
      await page.screenshot({ path: '/tmp/ticket-after-create.png', fullPage: true });
      console.log('Final screenshot saved to /tmp/ticket-after-create.png');
      
      // Print API requests
      console.log('\n=== API Requests ===');
      apiRequests.forEach(r => console.log(`  ${r.method} ${r.url}`));
      
      console.log('\n=== API Responses ===');
      apiResponses.forEach(r => console.log(`  ${r.method} ${r.url} → ${r.status}`));
    }
    
    console.log('\n=== TEST COMPLETE ===');
    
  } catch (err) {
    console.error('\n!!! TEST FAILED:', err.message);
    await page.screenshot({ path: '/tmp/ticket-error.png', fullPage: true });
    console.log('Error screenshot saved to /tmp/ticket-error.png');
  }

  await browser.close();
})();
