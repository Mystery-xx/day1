# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: user-profile-qa.spec.ts >> UserProfile - Manual QA Scenarios >> Scenario 1: Junior Profile - Detailed Response
- Location: e2e/user-profile-qa.spec.ts:32:7

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.selectOption: Target page, context or browser has been closed
Call log:
  - waiting for locator('select').first()
    - locator resolved to <select id="provider">…</select>
  - attempting select option action
    2 × waiting for element to be visible and enabled
      - did not find some options
    - retrying select option action
    - waiting 20ms
    2 × waiting for element to be visible and enabled
      - did not find some options
    - retrying select option action
      - waiting 100ms
    118 × waiting for element to be visible and enabled
        - did not find some options
      - retrying select option action
        - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - heading "Настройки модели" [level=3] [ref=e6]
    - generic [ref=e7]:
      - generic [ref=e8]:
        - generic [ref=e9]: AI Provider
        - combobox "AI Provider" [ref=e10]:
          - option "GPUStack" [selected]
          - option "HuggingFace"
        - generic [ref=e11]: Выберите провайдера для доступа к ИИ модели
      - generic [ref=e12]:
        - generic [ref=e13]:
          - generic [ref=e14]: Model
          - button "↻ Refresh" [ref=e15] [cursor=pointer]
        - combobox "Model" [ref=e16]:
          - option "qwen-image-2512"
          - option "minimax-m2.7"
          - option "qwen3-coder-next"
          - option "default-pr-review"
          - option "qwen3.6-27b"
          - option "default-coding"
          - option "whisper-large-v3-turbo"
          - option "default-chat"
          - option "qwen3-vl-embedding-8b"
          - option "qwen2.5-32b-gptq-rnd-mr-crawler"
          - option "qwen3.5-397b-a17b" [selected]
        - generic [ref=e17]: Выберите модель для генерации ответов
      - generic [ref=e18]:
        - generic [ref=e19]: "Temperature: 1"
        - 'slider "Temperature: 1" [ref=e20]': "1"
        - generic [ref=e21]: Креативность (0 = детерминировано, 2 = максимально случайно)
      - generic [ref=e22]:
        - generic [ref=e23]: "Max Tokens: 16384"
        - 'slider "Max Tokens: 16384" [ref=e24]': "16384"
        - generic [ref=e25]: Максимальная длина ответа (до 16K для qwen3.5-397b)
      - generic [ref=e26]:
        - generic [ref=e27]: "Top P: 1"
        - 'slider "Top P: 1" [ref=e28]': "1"
        - generic [ref=e29]: Ядро выборки (0.1 = консервативно, 1 = все токены)
      - generic [ref=e30]:
        - generic [ref=e31]: "Frequency Penalty: 0"
        - 'slider "Frequency Penalty: 0" [ref=e32]': "0"
        - generic [ref=e33]: Снижение повторяемости (0 = нет, 2 = сильно избегать повторов)
      - generic [ref=e34]:
        - generic [ref=e35]: "Presence Penalty: 0"
        - 'slider "Presence Penalty: 0" [ref=e36]': "0"
        - generic [ref=e37]: Исследование новых тем (0 = нет, 2 = избегать старых тем)
      - generic [ref=e38]:
        - generic [ref=e39]: Stop Sequences
        - textbox "Stop Sequences" [ref=e40]:
          - /placeholder: seq1, seq2, seq3
        - generic [ref=e41]: Последовательности для остановки генерации (через запятую)
      - generic [ref=e42]:
        - generic [ref=e43]:
          - generic [ref=e44] [cursor=pointer]: Отправлять историю чата
          - checkbox "Отправлять историю чата" [checked] [ref=e45] [cursor=pointer]
        - generic [ref=e46]: Если отключено, AI получает только текущее сообщение без истории диалога
      - generic [ref=e47]:
        - generic [ref=e48]: Context Strategy
        - combobox "Context Strategy" [ref=e49]:
          - option "Summary" [selected]
          - option "Sliding Window"
          - option "Sticky Facts"
        - generic [ref=e50]: Keep recent messages plus an AI-generated summary of older history
      - generic [ref=e51]:
        - generic [ref=e52]: Developer Profile
        - generic [ref=e53]: Выберите стиль ответов AI
        - generic [ref=e54]:
          - generic [ref=e55]:
            - generic [ref=e57]:
              - generic [ref=e58]: Default
              - generic [ref=e59]: Active
            - generic [ref=e60]: Без профиля. AI отвечает в стандартном стиле.
          - generic [ref=e61]:
            - generic [ref=e64]: Junior Developer
            - generic [ref=e65]: Подробные объяснения для начинающих разработчиков
            - button "Activate" [ref=e66] [cursor=pointer]
          - generic [ref=e67]:
            - generic [ref=e70]: Senior Developer
            - generic [ref=e71]: Краткие ответы для опытных разработчиков
            - button "Activate" [ref=e72] [cursor=pointer]
      - generic [ref=e73]:
        - generic [ref=e74]: Управление сессией
        - generic [ref=e75]:
          - button "+ Новый чат" [ref=e76] [cursor=pointer]
          - button "Очистить историю" [ref=e77] [cursor=pointer]
          - button "Удалить summary" [ref=e78] [cursor=pointer]
        - generic [ref=e79]: "Текущая сессия: 528fb7d6..."
      - generic [ref=e80]:
        - generic [ref=e81]: Список сессий
        - generic "a46afdcf-feea-4304-b848-07ba77d24463" [ref=e84] [cursor=pointer]:
          - generic [ref=e85]:
            - generic [ref=e86]: a46afdcf...
            - button "✕" [ref=e87]
          - generic [ref=e88]: Привет! Это отличная идея для нишевого Mini-SaaS
          - generic [ref=e89]:
            - generic [ref=e90]: "Сообщений: 4"
            - generic [ref=e91]: 21.01.70, 17:58
  - generic [ref=e92]:
    - generic [ref=e93]:
      - heading "Long-term Memory (Profile)" [level=3] [ref=e94]
      - generic [ref=e96]:
        - generic [ref=e97]:
          - strong [ref=e98]: "Profile:"
          - text: Default
        - generic [ref=e99]:
          - strong [ref=e100]: "Communication Style:"
          - text: none
    - generic [ref=e101]:
      - heading "Working Memory (Sticky Facts)" [level=3] [ref=e102]
      - generic [ref=e104]: Рабочая память пуста
    - generic [ref=e105]:
      - heading "Short-term Memory (Recent Messages)" [level=3] [ref=e106]
      - generic [ref=e108]: Нет сообщений
    - generic [ref=e109]:
      - heading "Backend → AI API Request" [level=3] [ref=e110]
      - generic [ref=e112]: No request sent yet
    - generic [ref=e113]:
      - heading "Backend ← AI API Response" [level=3] [ref=e114]
      - generic [ref=e116]: No response received yet
  - generic [ref=e117]:
    - generic [ref=e118]:
      - text: AI Chat
      - generic "528fb7d6-0716-42f3-96b6-e87765f581b7" [ref=e119]: "Session: 528fb7d6..."
    - generic [ref=e121]: Начните чат
    - generic [ref=e122]:
      - 'textbox "Например: Хочу заказать столик на завтра..." [ref=e123]'
      - button "Отправить" [disabled] [ref=e124]
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
> 58  |         await profileSelect.selectOption('junior');
      |                             ^ Error: locator.selectOption: Target page, context or browser has been closed
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
  101 |     await input.fill(TEST_QUESTION);
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
```