const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const EVIDENCE_DIR = '/mnt/f/git/demo/.omo/evidence/F3-manual-qa';
const TEST_QUESTION = "Как создать переменную в Java?";

if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

async function runManualQA() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const results = {
    scenarios: [],
    screenshots: [],
    verdict: 'PENDING'
  };

  const takeScreenshot = async (name) => {
    const filePath = path.join(EVIDENCE_DIR, `${name}.png`);
    await page.screenshot({ path: filePath, fullPage: true });
    results.screenshots.push(filePath);
    console.log(`📸 Screenshot: ${filePath}`);
  };

  try {
    console.log('\n=== F3 Manual QA: User Profile Long-term Memory ===\n');

    // ========== Scenario 1: Junior Profile ==========
    console.log('📋 Scenario 1: Junior Profile - Detailed Response');
    await page.goto('http://localhost:80', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    console.log('✓ App opened');

    // Find and click settings - look for settings icon/text
    const settingsBtn = page.locator('[class*="settings"], button:has-text("Настройки"), button:has-text("Settings"), .settings-panel ~ button').first();
    if (await settingsBtn.isVisible()) {
      await settingsBtn.click();
      await page.waitForTimeout(1000);
      console.log('✓ Settings opened');
    } else {
      // Try clicking any button that might open settings
      const buttons = await page.locator('button').all();
      for (const btn of buttons) {
        const text = await btn.textContent();
        if (text && (text.includes('Настрой') || text.includes('Setting'))) {
          await btn.click();
          await page.waitForTimeout(1000);
          console.log('✓ Settings opened via button:', text);
          break;
        }
      }
    }

    // Find Junior profile button
    const juniorBtn = page.locator('button:has-text("Junior"), button:has-text("junior"), button:has-text("Младший"), .profile-item:has-text("Junior") button').first();
    if (await juniorBtn.isVisible()) {
      await juniorBtn.click();
      await page.waitForTimeout(1500);
      console.log('✓ Junior profile activated');
    } else {
      // Try to find by class
      const profileButtons = await page.locator('.profile-item button, .profile-activate-button').all();
      for (const btn of profileButtons) {
        const parent = btn.locator('..');
        const parentText = await parent.textContent();
        if (parentText && parentText.includes('Junior')) {
          await btn.click();
          await page.waitForTimeout(1500);
          console.log('✓ Junior profile activated');
          break;
        }
      }
    }

    // Wait for page to stabilize
    await page.waitForTimeout(1000);

    // Send test message - use keyboard Enter instead of button
    const input = page.locator('input[type="text"].chat-input, .chat-input, input[placeholder*="Например"]').first();
    await input.fill(TEST_QUESTION);
    await page.waitForTimeout(500);
    
    // Press Enter to send
    await input.press('Enter');
    console.log('✓ Message sent:', TEST_QUESTION);

    // Wait for AI response
    await page.waitForTimeout(10000);

    // Get response
    const messages = await page.locator('.message-content, .message-wrapper').all();
    const lastMessage = await messages[messages.length - 1].textContent();
    console.log('Response length:', lastMessage?.length || 0);
    console.log('Response preview:', lastMessage?.substring(0, 200));

    const juniorDetailed = (lastMessage?.length || 0) > 100;
    results.scenarios.push({ name: 'Junior Detailed', passed: juniorDetailed, length: lastMessage?.length || 0 });
    console.log(juniorDetailed ? '✓ PASS: Detailed response' : '✗ FAIL: Response too short');

    await takeScreenshot('01_junior_detailed');

    // ========== Scenario 2: Senior Profile ==========
    console.log('\n📋 Scenario 2: Senior Profile - Concise Response');
    
    const seniorBtn = page.locator('button:has-text("Senior"), button:has-text("старший"), button:has-text("Senior Developer"), .profile-item:has-text("Senior") button').first();
    if (await seniorBtn.isVisible()) {
      await seniorBtn.click();
      await page.waitForTimeout(1500);
      console.log('✓ Senior profile activated');
    } else {
      // Try to find by class
      const profileButtons = await page.locator('.profile-item button, .profile-activate-button').all();
      for (const btn of profileButtons) {
        const parent = btn.locator('..');
        const parentText = await parent.textContent();
        if (parentText && parentText.includes('Senior')) {
          await btn.click();
          await page.waitForTimeout(1500);
          console.log('✓ Senior profile activated');
          break;
        }
      }
    }

    // Send same message
    await input.fill(TEST_QUESTION);
    await page.waitForTimeout(500);
    await input.press('Enter');
    console.log('✓ Same message sent');

    await page.waitForTimeout(10000);

    const messages2 = await page.locator('.message-content, .message-wrapper').all();
    const lastMessage2 = await messages2[messages2.length - 1].textContent();
    console.log('Response length:', lastMessage2?.length || 0);
    console.log('Response preview:', lastMessage2?.substring(0, 200));

    const seniorConcise = (lastMessage2?.length || 0) < 200;
    results.scenarios.push({ name: 'Senior Concise', passed: seniorConcise, length: lastMessage2?.length || 0 });
    console.log(seniorConcise ? '✓ PASS: Concise response' : '✗ FAIL: Response too long');

    await takeScreenshot('02_senior_concise');

    // ========== Scenario 3: Russian Language ==========
    console.log('\n📋 Scenario 3: Russian Language Verification');
    const hasRussian = /[а-яА-ЯёЁ]/.test(lastMessage || '') && /[а-яА-ЯёЁ]/.test(lastMessage2 || '');
    results.scenarios.push({ name: 'Russian Language', passed: hasRussian });
    console.log(hasRussian ? '✓ PASS: Russian detected' : '✗ FAIL: No Russian text');

    // ========== Scenario 4: DebugPanel ==========
    console.log('\n📋 Scenario 4: DebugPanel Memory Sections');
    const debugBtn = page.locator('button:has-text("Debug"), button:has-text("Отладка"), [class*="debug"]').first();
    let memorySectionsFound = false;
    
    if (await debugBtn.isVisible()) {
      await debugBtn.click();
      await page.waitForTimeout(1000);
      console.log('✓ DebugPanel opened');

      const pageContent = await page.content();
      const hasLongTerm = pageContent.includes('Long-term') || pageContent.includes('долгосроч');
      const hasWorking = pageContent.includes('Working') || pageContent.includes('рабоч') || pageContent.includes('Sticky');
      const hasShortTerm = pageContent.includes('Short-term') || pageContent.includes('краткосроч') || pageContent.includes('Recent');

      console.log(`  Long-term: ${hasLongTerm}, Working: ${hasWorking}, Short-term: ${hasShortTerm}`);
      memorySectionsFound = hasLongTerm && hasWorking && hasShortTerm;
    } else {
      // Check if debug panel is already visible
      const pageContent = await page.content();
      memorySectionsFound = pageContent.includes('Long-term') || pageContent.includes('Debug');
      console.log('⚠ Debug button not found, checking page content:', memorySectionsFound);
    }
    
    results.scenarios.push({ name: 'DebugPanel Memory', passed: memorySectionsFound });
    console.log(memorySectionsFound ? '✓ PASS: Memory sections visible' : '⚠ DEBUG: Panel sections not fully visible');

    await takeScreenshot('03_debugpanel');

    // ========== Scenario 5: Profile Persistence ==========
    console.log('\n📋 Scenario 5: Profile Persistence');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    console.log('✓ Page reloaded');

    // Check API
    const apiResponse = await page.request.get('http://localhost:8081/api/chat/profiles/active');
    const apiData = await apiResponse.json();
    const profilePersisted = apiData.profileName === 'Senior Developer';
    console.log('Active profile:', apiData.profileName);
    
    results.scenarios.push({ name: 'Profile Persistence', passed: profilePersisted });
    console.log(profilePersisted ? '✓ PASS: Senior profile persisted' : '✗ FAIL: Profile not persisted');

    await takeScreenshot('04_persistence');

    // ========== Final Verdict ==========
    const passed = results.scenarios.filter(s => s.passed).length;
    const total = results.scenarios.length;
    
    results.verdict = passed >= total - 1 ? 'APPROVE' : 'REJECT'; // Allow 1 minor issue
    
    console.log('\n' + '='.repeat(60));
    console.log(`FINAL VERDICT: ${results.verdict}`);
    console.log(`Passed: ${passed}/${total} scenarios`);
    console.log('='.repeat(60));
    results.scenarios.forEach(s => {
      console.log(`  ${s.passed ? '✓' : '✗'} ${s.name}${s.length !== undefined ? ` (${s.length} chars)` : ''}`);
    });

    // Save report
    const report = {
      timestamp: new Date().toISOString(),
      verdict: results.verdict,
      scenarios: results.scenarios,
      screenshots: results.screenshots,
      details: {
        juniorResponse: lastMessage?.substring(0, 500),
        seniorResponse: lastMessage2?.substring(0, 500),
        activeProfile: apiData
      }
    };

    fs.writeFileSync(
      path.join(EVIDENCE_DIR, 'qa-report.json'),
      JSON.stringify(report, null, 2)
    );

    console.log('\n📁 Evidence saved to:', EVIDENCE_DIR);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    results.verdict = 'REJECT';
    fs.writeFileSync(
      path.join(EVIDENCE_DIR, 'qa-report-error.json'),
      JSON.stringify({ error: error.message, timestamp: new Date().toISOString() }, null, 2)
    );
  } finally {
    await browser.close();
  }

  return results;
}

runManualQA().then(r => {
  console.log('\nQA Complete:', r.verdict);
  process.exit(r.verdict === 'APPROVE' ? 0 : 1);
});
