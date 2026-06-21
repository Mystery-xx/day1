# AI Chat Application

AI-powered chat application with advanced task orchestration, working memory, and multi-provider support.

## ⚠️ Важно: Только Docker запуск

**Приложение предназначено для запуска ИСКЛЮЧИТЕЛЬНО в Docker контейнерах.**

Локальная разработка (npm/mvn) **не рекомендуется** из-за:
- Сложностей с проксированием между frontend и backend
- Необходимости настройки CORS для каждого окружения
- Проблем с доступом к API ключам в локальной среде
- Различий в сетевой конфигурации между Docker и localhost

**Используйте Docker для всех сценариев разработки и продакшена.**

## Быстрый старт

```bash
# 1. Скопируйте конфигурацию окружения
cp .env.example .env

# 2. Отредактируйте .env и укажите ваши значения
# AI_API_KEY=your-api-key-here
# AI_API_URL=https://your-ai-api.com/v1
# AI_MODEL=qwen3.5-397b-a17b

# 3. Соберите и запустите контейнеры
docker-compose up --build

# 4. Откройте http://localhost:80 в браузере
```

Для остановки:
```bash
docker-compose down
```

Для остановки с удалением данных:
```bash
docker-compose down -v
```

## Архитектура

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Browser    │────▶│   Frontend   │────▶│   Backend    │
│             │     │   (Nginx)    │     │ (Spring Boot)│
│             │     │   :80        │     │   :8080      │
└─────────────┘     └──────────────┘     └──────┬───────┘
                                                │
                                                ▼
                                         ┌──────────────┐
                                         │   AI API     │
                                         │ (GPUStack/   │
                                         │  HuggingFace)│
                                         └──────────────┘
```

### Технологический стек

**Backend:**
- Spring Boot 3.2, Java 17
- WebFlux + WebClient (реактивный HTTP клиент)
- Spring Data JPA + Hibernate
- H2 Database (embedded), PostgreSQL, SQLite (multi-datasource)
- Flyway (миграции БД)
- Caffeine (кэширование)
- Maven (сборка)

**Frontend:**
- React 18 + Vite 5
- Pure CSS (без фреймворков)
- react-markdown (рендеринг Markdown)
- recharts (визуализация)
- Nginx (продакшен сервер)

**Docker:**
- Multi-stage сборка для обоих сервисов
- Docker Compose для оркестрации
- Сетевая изоляция между сервисами

## Структура проекта

```
ai-chat/
├── ai-chat-backend/           # Spring Boot backend
│   ├── Dockerfile
│   ├── pom.xml
│   └── src/main/
│       ├── java/com/aichat/
│       │   ├── AiChatApplication.java
│       │   ├── config/
│       │   │   ├── AiChatProperties.java
│       │   │   ├── WebConfig.java
│       │   │   ├── CacheConfig.java
│       │   │   └── JacksonConfig.java
│       │   ├── controller/
│       │   │   ├── ChatController.java
│       │   │   └── UserProfileController.java
│       │   ├── service/
│       │   │   ├── AiChatService.java
│       │   │   ├── TaskOrchestrator.java
│       │   │   ├── ChatHistoryService.java
│       │   │   ├── StickyFactService.java
│       │   │   ├── FactExtractionService.java
│       │   │   ├── UserProfileService.java
│       │   │   └── MemoryService.java
│       │   ├── agent/
│       │   │   ├── TaskAgent.java
│       │   │   ├── AbstractAgent.java
│       │   │   ├── AgentFactory.java
│       │   │   ├── PlanningAgent.java
│       │   │   ├── ExecutionAgent.java
│       │   │   ├── ValidationAgent.java
│       │   │   └── DoneAgent.java
│       │   ├── context/
│       │   │   ├── ContextStrategy.java
│       │   │   ├── ContextStrategyFactory.java
│       │   │   ├── SummaryContextStrategy.java
│       │   │   ├── StickyFactsContextStrategy.java
│       │   │   └── SlidingWindowContextStrategy.java
│       │   ├── strategy/
│       │   │   ├── TransitionStrategy.java
│       │   │   └── AiTransitionStrategy.java
│       │   ├── entity/
│       │   │   ├── ChatSession.java
│       │   │   ├── ChatMessage.java
│       │   │   ├── StickyFact.java
│       │   │   ├── TaskContextEntity.java
│       │   │   ├── UserProfile.java
│       │   │   ├── ArchitecturalDecision.java
│       │   │   ├── DomainKnowledge.java
│       │   │   └── ProjectConstraint.java
│       │   ├── repository/
│       │   │   └── (8 Spring Data JPA repositories)
│       │   ├── dto/
│       │   │   └── (17 DTO классов)
│       │   ├── enums/
│       │   │   └── TaskState.java
│       │   ├── builder/
│       │   │   └── PromptBuilder.java
│       │   └── listener/
│       │       └── TaskStateEventListener.java
│       └── resources/
│           ├── application.yml
│           └── db/migration/
│               ├── V1__initial_schema.sql
│               └── V2__update_task_context.sql
│
├── ai-chat-frontend/          # React frontend
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.js
│   ├── nginx.conf
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── index.css
│       ├── components/
│       │   ├── Message.jsx
│       │   ├── SessionList.jsx
│       │   ├── DebugPanel.jsx
│       │   ├── StatePanel.jsx
│       │   └── SettingsPanel.jsx
│       └── hooks/
│           ├── useSession.js
│           ├── useChatHistory.js
│           └── useSessionList.js
│
├── e2e/                       # Playwright E2E тесты
├── docker-compose.yml
├── .env.example
└── README.md
```

## Переменные окружения

| Переменная | Значение по умолчанию | Описание |
|------------|----------------------|----------|
| `AI_API_KEY` | (требуется) | API ключ для доступа к ИИ |
| `AI_API_URL` | (требуется) | Базовый URL ИИ API |
| `AI_MODEL` | (требуется) | Название модели |
| `AI_PROVIDER` | `gpustack` | Провайдер: `gpustack` или `huggingface` |
| `GPUSTACK_API_URL` | - | URL GPUStack API (опционально) |
| `HUGGINGFACE_API_URL` | `https://router.huggingface.co/v1` | URL HuggingFace API |
| `HUGGINGFACE_TOKEN` | (требуется для HF) | Токен HuggingFace |
| `AI_TEMPERATURE` | `0.7` | Температура генерации |
| `AI_MAX_TOKENS` | `1024` | Максимум токенов в ответе |
| `AI_TOP_P` | `1.0` | Top P sampling |
| `AI_FREQUENCY_PENALTY` | `0.0` | Частотный штраф |
| `AI_PRESENCE_PENALTY` | `0.0` | Штраф присутствия |
| `AI_STOP` | - | Stop sequences (через запятую) |

## Основные возможности

### 🎯 Чат с ИИ

- **SSE Streaming** - потоковая передача ответов в реальном времени
- **Markdown рендеринг** - форматирование ответов через react-markdown
- **История диалога** - сохранение контекста в рамках сессии
- **Ветвление (Branch)** - создание новой сессии на основе существующей до указанного сообщения
- **Дублирование сессий** - копирование сессии полностью (до 3 копий)

### 🧠 Управление памятью

**Три уровня памяти:**

1. **Долгосрочная память (Long-term Memory)**
   - Профили разработчиков с настройками стиля общения
   - Шаблоны промптов для разных ролей
   - Сохраняются между сессиями

2. **Рабочая память (Working Memory)**
   - Sticky Facts - ключевые факты из диалога
   - Автоматическое извлечение после N сообщений
   - Ручное добавление/удаление фактов
   - Throttling для предотвращения избыточного извлечения

3. **Краткосрочная память (Short-term Memory)**
   - Последние 10 сообщений диалога
   - Используется для контекста при генерации ответов

### 📊 Стратегии управления контекстом

Три стратегии для разных сценариев:

| Стратегия | Описание | Когда использовать |
|-----------|----------|-------------------|
| **Summary** | Автоматическая суммаризация старых сообщений | Длинные диалоги, экономия токенов |
| **Sticky Facts** | Контекст на основе ключевых фактов | Когда важны конкретные детали |
| **Sliding Window** | Фиксированное окно последних сообщений | Короткие диалоги, простой режим |

### 🤖 State Machine (Оркестрация задач)

Автоматизированная оркестрация задач через state machine:

**4 состояния:**
- 🟡 **PLANNING** - Планирование задачи
- 🔵 **EXECUTION** - Выполнение плана
- 🟠 **VALIDATION** - Валидация результата
- 🟢 **DONE** - Задача завершена

**Агенты:**
- **PlanningAgent** - Генерирует план, ожидает подтверждения
- **ExecutionAgent** - Реализует утвержденный план
- **ValidationAgent** - Проверяет результат, выявляет проблемы
- **DoneAgent** - Обрабатывает завершенные задачи

**Переходы:**
- PLANNING → EXECUTION (после утверждения плана)
- EXECUTION → VALIDATION (после реализации)
- VALIDATION → EXECUTION (доработка) | DONE (успех) | PLANNING (новые требования)
- DONE → PLANNING (новая итерация)

### ⚙️ Настройки модели

- **Мультипровайдер**: GPUStack (по умолчанию), HuggingFace
- **Выбор модели**: Автоматическая загрузка доступных моделей
- **Категоризация моделей**:
  - **super**: 300B+ параметров (qwen3.5-397b, qwen3-235b)
  - **strong**: 70B-100B (qwen2.5-72b, llama-3-70b)
  - **medium**: 13B-32B
  - **weak**: <8B (qwen2.5-0.5b, phi-2)
- **Параметры генерации**:
  - Temperature
  - Max tokens
  - Top P
  - Frequency penalty
  - Presence penalty
  - Stop sequences

### 🐛 Debug-панель

- Просмотр 3 уровней памяти
- Raw JSON запросов/ответов API
- Отладка суммаризации
- Информация о токенах

## API Endpoints

### Чат

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/chat/stream` | POST | Стриминг ответов ИИ (SSE) |
| `/api/chat` | POST | Отправить сообщение, получить ответ |
| `/api/chat/health` | GET | Проверка работоспособности |
| `/api/chat/models` | GET | Список доступных моделей |

### Сессии

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/chat/sessions` | GET | Список всех сессий (с пагинацией) |
| `/api/chat/sessions` | DELETE | Удалить все сессии |
| `/api/chat/history/session` | POST | Создать новую сессию |
| `/api/chat/sessions/{sessionId}` | DELETE | Удалить конкретную сессию |
| `/api/chat/sessions/{sessionId}/duplicate` | POST | Дублировать сессию (параметр `count`) |
| `/api/chat/sessions/{sessionId}/branch` | POST | Создать ветку сессии до сообщения (параметр `messageIndex`) |
| `/api/chat/sessions/{sessionId}/summary` | DELETE | Удалить суммаризацию сессии |

### История сообщений

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/chat/history/{sessionId}` | GET | Получить историю сообщений сессии |
| `/api/chat/history/{sessionId}` | DELETE | Удалить историю сообщений сессии |

### Sticky Facts (Рабочая память)

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/chat/sessions/{sessionId}/sticky-facts` | GET | Получить список фактов сессии |
| `/api/chat/sessions/{sessionId}/sticky-facts` | POST | Добавить новый факт (body: `{factKey, factValue}`) |
| `/api/chat/sessions/{sessionId}/sticky-facts/{factKey}` | DELETE | Удалить конкретный факт |
| `/api/chat/sessions/{sessionId}/sticky-facts` | DELETE | Удалить все факты сессии |
| `/api/chat/sessions/{sessionId}/extract-facts` | POST | Ручное извлечение фактов (body: `{model, provider}` - опционально) |

### State Machine

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/chat/sessions/{sessionId}/state` | GET | Получить текущее состояние задачи |

### Профили разработчиков

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/chat/profiles` | GET | Список всех профилей |
| `/api/chat/profiles/{id}` | GET | Получить профиль по ID |
| `/api/chat/profiles/{id}/activate` | POST | Активировать профиль |
| `/api/chat/profiles/active` | GET | Получить активный профиль |

## База данных

### Таблицы

| Таблица | Описание |
|---------|----------|
| `chat_session` | Сессии чата с состоянием state machine |
| `chat_message` | История сообщений с метаданными |
| `sticky_fact` | Рабочая память (факты сессии) |
| `task_context` | Контекст state machine (план, реализация, валидация) |
| `developer_profile` | Профили разработчиков (долгосрочная память) |
| `architectural_decision` | Архитектурные решения |
| `domain_knowledge` | Предметные знания |
| `project_constraint` | Ограничения проекта |

### Поддерживаемые БД

- **H2** (по умолчанию) - embedded, файл `/data/chatdb`
- **PostgreSQL** - для долгосрочной памяти
- **SQLite** - для рабочей памяти

Миграции выполняются через Flyway.

## Troubleshooting

### Просмотр логов

```bash
# Все логи
docker-compose logs -f

# Только backend
docker-compose logs -f backend

# Только frontend
docker-compose logs -f frontend
```

### 500 Internal Server Error

**Причина**: Ошибка CORS конфигурации или проблемы с AI API.

**Решение**:
1. Проверьте логи backend: `docker logs ai-chat-backend`
2. Убедитесь что API ключ правильный в `.env`
3. Проверьте доступность AI API: `curl $AI_API_URL/models`

### 503 Service Unavailable

**Причина**: Backend недоступен или таймаут запроса к AI API.

**Решение**:
1. Проверьте что backend запущен: `docker ps | grep backend`
2. Проверьте логи на предмет таймаутов
3. Увеличьте таймаут в `application.yml` если AI API отвечает медленно

### Cannot connect to backend

**Причина**: Frontend в Docker не может достичь backend.

**Решение**:
1. Убедитесь что оба контейнера в одной сети: `docker network inspect demo_ai-chat-network`
2. Проверьте что backend слушает `0.0.0.0:8080`
3. Перезапустите контейнеры: `docker-compose restart`

### Проблемы с портами

**Frontend недоступен на порту 80**:
- Проверьте что порт 80 не занят: `docker ps | grep :80`
- Измените порт в `docker-compose.yml`: `ports: - "8080:80"`

**Backend недоступен на порту 8081**:
- Проверьте логи: `docker logs ai-chat-backend`
- Убедитесь что `application.yml` настроен на порт 8080

## Разработка

### Внесение изменений в код

**ВАЖНО**: После ЛЮБОГО изменения кода необходимо пересобрать контейнеры:

```bash
docker-compose up --build
```

Причины:
- Приложение работает ИСКЛЮЧИТЕЛЬНО в Docker контейнерах
- Изменения в локальных файлах НЕ подхватываются горячо
- Оба сервиса должны быть пересобраны для применения изменений

### Избирательная пересборка

Если изменен только один сервис:

```bash
# Только frontend
docker-compose build ai-chat-frontend && docker-compose up ai-chat-frontend

# Только backend
docker-compose build ai-chat-backend && docker-compose up ai-chat-backend
```

Но полная пересборка (`docker-compose up --build`) рекомендуется для консистентности.

### E2E тесты

Проект использует Playwright для E2E тестирования:

```bash
# Запуск тестов
npx playwright test

# Запуск с UI
npx playwright test --ui

# Отчет
npx playwright show-report
```

## Лицензия

ISC
