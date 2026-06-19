# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: user-profile-qa.spec.ts >> UserProfile - Manual QA Scenarios >> Scenario 2: Senior Profile - Concise Response
- Location: e2e/user-profile-qa.spec.ts:88:7

# Error details

```
Error: locator.fill: Target page, context or browser has been closed
Call log:
  - waiting for locator('input[placeholder*="message"], input[type="text"], textarea').first()

```

# Test source

```ts
  1   | import { test, expect, Page } from '@playwright/test';
  2   | import * as fs from 'fs';
  3   | import * as path from 'path';
  4   | 
  5   | const EVIDENCE_DIR = '/mnt/f/git/demo/.omo/evidence/F3-manual-qa';
  6   | const TEST_QUESTION = "Как создать переменную в Java?";
  7   | 
  8   | test.describe('UserProfile - Manual QA Scenarios', () => {
  9   |   let page: Page;
  10  |   let screenshots: string[] = [];
  11  | 
  12  |   test.beforeAll(async ({ browser }) => {
  13  |     page = await browser.newPage();
  14  |     // Ensure evidence directory exists
  15  |     if (!fs.existsSync(EVIDENCE_DIR)) {
  16  |       fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  17  |     }
  18  |   });
  19  | 
  20  |   test.afterAll(async () => {
  21  |     await page.close();
  22  |   });
  23  | 
  24  |   const takeScreenshot = async (name: string) => {
  25  |     const filePath = path.join(EVIDENCE_DIR, `${name}.png`);
  26  |     await page.screenshot({ path: filePath, fullPage: true });
  27  |     screenshots.push(filePath);
  28  |     console.log(`Screenshot saved: ${filePath}`);
  29  |     return filePath;
  30  |   };
  31  | 
  32  |   test('Scenario 1: Junior Profile - Detailed Response', async () => {
  33  |     console.log('\n=== Scenario 1: Junior Profile ===');
  34  |     
  35  |     // Step 1: Open app
  36  |     await page.goto('http://localhost:80', { waitUntil: 'networkidle' });
  37  |     await expect(page).toHaveTitle(/AI Chat/);
  38  |     console.log('✓ App opened');
  39  | 
  40  |     // Step 2: Open Settings Panel
  41  |     const settingsButton = page.locator('button').filter({ hasText: /settings|настройки/i }).first();
  42  |     if (await settingsButton.isVisible()) {
  43  |       await settingsButton.click();
  44  |       await page.waitForTimeout(500);
  45  |       console.log('✓ Settings button clicked');
  46  |     }
  47  | 
  48  |     // Step 3-4: Find Developer Profile section and activate Junior
  49  |     const juniorButton = page.locator('button').filter({ hasText: /junior|младший/i }).first();
  50  |     if (await juniorButton.isVisible()) {
  51  |       await juniorButton.click();
  52  |       await page.waitForTimeout(1000);
  53  |       console.log('✓ Junior profile activated');
  54  |     } else {
  55  |       // Try alternative selectors
  56  |       const profileSelect = page.locator('select').first();
  57  |       if (await profileSelect.isVisible()) {
  58  |         await profileSelect.selectOption('junior');
  59  |         await page.waitForTimeout(1000);
  60  |       }
  61  |     }
  62  | 
  63  |     // Step 5: Send message
  64  |     const input = page.locator('input[placeholder*="message"], input[type="text"], textarea').first();
  65  |     await input.fill(TEST_QUESTION);
  66  |     
  67  |     const sendButton = page.locator('button').filter({ hasText: /send|отправить/i }).first();
  68  |     await sendButton.click();
  69  |     console.log('✓ Message sent:', TEST_QUESTION);
  70  | 
  71  |     // Wait for response
  72  |     await page.waitForTimeout(5000);
  73  | 
  74  |     // Step 6: Verify detailed response
  75  |     const responseText = await page.locator('.message-user, .message-assistant, [class*="message"]').last().textContent() || '';
  76  |     console.log('Response length:', responseText.length);
  77  |     console.log('Response preview:', responseText.substring(0, 200));
  78  |     
  79  |     // Junior should give detailed response (> 150 chars)
  80  |     const isDetailed = responseText.length > 150;
  81  |     console.log('✓ Is detailed:', isDetailed);
  82  | 
  83  |     await takeScreenshot('01_junior_profile_response');
  84  |     
  85  |     expect(isDetailed).toBeTruthy();
  86  |   });
  87  | 
  88  |   test('Scenario 2: Senior Profile - Concise Response', async () => {
  89  |     console.log('\n=== Scenario 2: Senior Profile ===');
  90  |     
  91  |     // Activate Senior profile
  92  |     const seniorButton = page.locator('button').filter({ hasText: /senior|старший/i }).first();
  93  |     if (await seniorButton.isVisible()) {
  94  |       await seniorButton.click();
  95  |       await page.waitForTimeout(1000);
  96  |       console.log('✓ Senior profile activated');
  97  |     }
  98  | 
  99  |     // Send SAME message
  100 |     const input = page.locator('input[placeholder*="message"], input[type="text"], textarea').first();
> 101 |     await input.fill(TEST_QUESTION);
      |                 ^ Error: locator.fill: Target page, context or browser has been closed
  102 |     
  103 |     const sendButton = page.locator('button').filter({ hasText: /send|отправить/i }).first();
  104 |     await sendButton.click();
  105 |     console.log('✓ Same message sent');
  106 | 
  107 |     // Wait for response
  108 |     await page.waitForTimeout(5000);
  109 | 
  110 |     // Verify concise response
  111 |     const responseText = await page.locator('.message-user, .message-assistant, [class*="message"]').last().textContent() || '';
  112 |     console.log('Response length:', responseText.length);
  113 |     console.log('Response preview:', responseText.substring(0, 200));
  114 |     
  115 |     // Senior should give concise response (< 150 chars or significantly shorter than junior)
  116 |     const isConcise = responseText.length < 150;
  117 |     console.log('✓ Is concise:', isConcise);
  118 | 
  119 |     await takeScreenshot('02_senior_profile_response');
  120 |     
  121 |     expect(isConcise).toBeTruthy();
  122 |   });
  123 | 
  124 |   test('Scenario 3: Russian Language Verification', async () => {
  125 |     console.log('\n=== Scenario 3: Russian Language ===');
  126 |     
  127 |     // Get last response
  128 |     const responseText = await page.locator('.message-user, .message-assistant, [class*="message"]').last().textContent() || '';
  129 |     
  130 |     // Check for Russian characters
  131 |     const hasRussian = /[а-яА-ЯёЁ]/.test(responseText);
  132 |     console.log('✓ Contains Russian:', hasRussian);
  133 |     console.log('Response sample:', responseText.substring(0, 100));
  134 | 
  135 |     expect(hasRussian).toBeTruthy();
  136 |   });
  137 | 
  138 |   test('Scenario 4: DebugPanel Memory Sections', async () => {
  139 |     console.log('\n=== Scenario 4: DebugPanel Memory ===');
  140 |     
  141 |     // Look for DebugPanel or debug button
  142 |     const debugButton = page.locator('button').filter({ hasText: /debug|отладка/i }).first();
  143 |     if (await debugButton.isVisible()) {
  144 |       await debugButton.click();
  145 |       await page.waitForTimeout(500);
  146 |       console.log('✓ DebugPanel opened');
  147 |     }
  148 | 
  149 |     // Check for 3 memory sections
  150 |     const hasLongTerm = await page.locator('text=long-term, text=долгосроч').first().isVisible().catch(() => false);
  151 |     const hasWorking = await page.locator('text=working, text=рабоч').first().isVisible().catch(() => false);
  152 |     const hasShortTerm = await page.locator('text=short-term, text=краткосроч').first().isVisible().catch(() => false);
  153 | 
  154 |     console.log('✓ Long-term Memory visible:', hasLongTerm);
  155 |     console.log('✓ Working Memory visible:', hasWorking);
  156 |     console.log('✓ Short-term Memory visible:', hasShortTerm);
  157 | 
  158 |     await takeScreenshot('03_debugpanel_memory_sections');
  159 | 
  160 |     // At least one should be visible
  161 |     expect(hasLongTerm || hasWorking || hasShortTerm).toBeTruthy();
  162 |   });
  163 | 
  164 |   test('Scenario 5: Profile Persistence', async () => {
  165 |     console.log('\n=== Scenario 5: Profile Persistence ===');
  166 |     
  167 |     // Reload page
  168 |     await page.reload({ waitUntil: 'networkidle' });
  169 |     await page.waitForTimeout(1000);
  170 |     console.log('✓ Page reloaded');
  171 | 
  172 |     // Check if Senior profile is still active
  173 |     const seniorActive = await page.locator('button').filter({ hasText: /senior|старший/i }).first().isEnabled();
  174 |     const juniorActive = await page.locator('button').filter({ hasText: /junior|младший/i }).first().isEnabled();
  175 |     
  176 |     // Or check API
  177 |     const response = await page.request.get('http://localhost:8081/api/chat/profiles/active');
  178 |     const data = await response.json();
  179 |     console.log('Active profile:', data.profileName);
  180 |     console.log('✓ Profile persisted:', data.profileName === 'Senior Developer');
  181 | 
  182 |     await takeScreenshot('04_profile_persistence');
  183 | 
  184 |     expect(data.profileName).toBe('Senior Developer');
  185 |   });
  186 | });
  187 | 
```