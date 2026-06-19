import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const EVIDENCE_DIR = '/mnt/f/git/demo/.omo/evidence/F3-manual-qa';
const TEST_QUESTION = "Как создать переменную в Java?";

test.describe('UserProfile - Manual QA Scenarios', () => {
  let page: Page;
  let screenshots: string[] = [];

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    // Ensure evidence directory exists
    if (!fs.existsSync(EVIDENCE_DIR)) {
      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    }
  });

  test.afterAll(async () => {
    await page.close();
  });

  const takeScreenshot = async (name: string) => {
    const filePath = path.join(EVIDENCE_DIR, `${name}.png`);
    await page.screenshot({ path: filePath, fullPage: true });
    screenshots.push(filePath);
    console.log(`Screenshot saved: ${filePath}`);
    return filePath;
  };

  test('Scenario 1: Junior Profile - Detailed Response', async () => {
    console.log('\n=== Scenario 1: Junior Profile ===');
    
    // Step 1: Open app
    await page.goto('http://localhost:80', { waitUntil: 'networkidle' });
    await expect(page).toHaveTitle(/AI Chat/);
    console.log('✓ App opened');

    // Step 2: Open Settings Panel
    const settingsButton = page.locator('button').filter({ hasText: /settings|настройки/i }).first();
    if (await settingsButton.isVisible()) {
      await settingsButton.click();
      await page.waitForTimeout(500);
      console.log('✓ Settings button clicked');
    }

    // Step 3-4: Find Developer Profile section and activate Junior
    const juniorButton = page.locator('button').filter({ hasText: /junior|младший/i }).first();
    if (await juniorButton.isVisible()) {
      await juniorButton.click();
      await page.waitForTimeout(1000);
      console.log('✓ Junior profile activated');
    } else {
      // Try alternative selectors
      const profileSelect = page.locator('select').first();
      if (await profileSelect.isVisible()) {
        await profileSelect.selectOption('junior');
        await page.waitForTimeout(1000);
      }
    }

    // Step 5: Send message
    const input = page.locator('input[placeholder*="message"], input[type="text"], textarea').first();
    await input.fill(TEST_QUESTION);
    
    const sendButton = page.locator('button').filter({ hasText: /send|отправить/i }).first();
    await sendButton.click();
    console.log('✓ Message sent:', TEST_QUESTION);

    // Wait for response
    await page.waitForTimeout(5000);

    // Step 6: Verify detailed response
    const responseText = await page.locator('.message-user, .message-assistant, [class*="message"]').last().textContent() || '';
    console.log('Response length:', responseText.length);
    console.log('Response preview:', responseText.substring(0, 200));
    
    // Junior should give detailed response (> 150 chars)
    const isDetailed = responseText.length > 150;
    console.log('✓ Is detailed:', isDetailed);

    await takeScreenshot('01_junior_profile_response');
    
    expect(isDetailed).toBeTruthy();
  });

  test('Scenario 2: Senior Profile - Concise Response', async () => {
    console.log('\n=== Scenario 2: Senior Profile ===');
    
    // Activate Senior profile
    const seniorButton = page.locator('button').filter({ hasText: /senior|старший/i }).first();
    if (await seniorButton.isVisible()) {
      await seniorButton.click();
      await page.waitForTimeout(1000);
      console.log('✓ Senior profile activated');
    }

    // Send SAME message
    const input = page.locator('input[placeholder*="message"], input[type="text"], textarea').first();
    await input.fill(TEST_QUESTION);
    
    const sendButton = page.locator('button').filter({ hasText: /send|отправить/i }).first();
    await sendButton.click();
    console.log('✓ Same message sent');

    // Wait for response
    await page.waitForTimeout(5000);

    // Verify concise response
    const responseText = await page.locator('.message-user, .message-assistant, [class*="message"]').last().textContent() || '';
    console.log('Response length:', responseText.length);
    console.log('Response preview:', responseText.substring(0, 200));
    
    // Senior should give concise response (< 150 chars or significantly shorter than junior)
    const isConcise = responseText.length < 150;
    console.log('✓ Is concise:', isConcise);

    await takeScreenshot('02_senior_profile_response');
    
    expect(isConcise).toBeTruthy();
  });

  test('Scenario 3: Russian Language Verification', async () => {
    console.log('\n=== Scenario 3: Russian Language ===');
    
    // Get last response
    const responseText = await page.locator('.message-user, .message-assistant, [class*="message"]').last().textContent() || '';
    
    // Check for Russian characters
    const hasRussian = /[а-яА-ЯёЁ]/.test(responseText);
    console.log('✓ Contains Russian:', hasRussian);
    console.log('Response sample:', responseText.substring(0, 100));

    expect(hasRussian).toBeTruthy();
  });

  test('Scenario 4: DebugPanel Memory Sections', async () => {
    console.log('\n=== Scenario 4: DebugPanel Memory ===');
    
    // Look for DebugPanel or debug button
    const debugButton = page.locator('button').filter({ hasText: /debug|отладка/i }).first();
    if (await debugButton.isVisible()) {
      await debugButton.click();
      await page.waitForTimeout(500);
      console.log('✓ DebugPanel opened');
    }

    // Check for 3 memory sections
    const hasLongTerm = await page.locator('text=long-term, text=долгосроч').first().isVisible().catch(() => false);
    const hasWorking = await page.locator('text=working, text=рабоч').first().isVisible().catch(() => false);
    const hasShortTerm = await page.locator('text=short-term, text=краткосроч').first().isVisible().catch(() => false);

    console.log('✓ Long-term Memory visible:', hasLongTerm);
    console.log('✓ Working Memory visible:', hasWorking);
    console.log('✓ Short-term Memory visible:', hasShortTerm);

    await takeScreenshot('03_debugpanel_memory_sections');

    // At least one should be visible
    expect(hasLongTerm || hasWorking || hasShortTerm).toBeTruthy();
  });

  test('Scenario 5: Profile Persistence', async () => {
    console.log('\n=== Scenario 5: Profile Persistence ===');
    
    // Reload page
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    console.log('✓ Page reloaded');

    // Check if Senior profile is still active
    const seniorActive = await page.locator('button').filter({ hasText: /senior|старший/i }).first().isEnabled();
    const juniorActive = await page.locator('button').filter({ hasText: /junior|младший/i }).first().isEnabled();
    
    // Or check API
    const response = await page.request.get('http://localhost:8081/api/chat/profiles/active');
    const data = await response.json();
    console.log('Active profile:', data.profileName);
    console.log('✓ Profile persisted:', data.profileName === 'Senior Developer');

    await takeScreenshot('04_profile_persistence');

    expect(data.profileName).toBe('Senior Developer');
  });
});
