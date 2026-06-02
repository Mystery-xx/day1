# AI Chat Application

Веб-приложение чат для работы с ИИ через OpenAI-compatible API.

## ⚠️ Важно: Только Docker запуск

**Приложение предназначено для запуска ИСКЛЮЧИТЕЛЬНО в Docker контейнерах.**

Локальная разработка (npm/mvn) **не рекомендуется** из-за:
- Сложностей с проксированием между frontend и backend
- Необходимости настройки CORS для каждого окружения
- Проблем с доступом к API ключам в локальной среде
- Различий в сетевой конфигурации между Docker и localhost

**Используйте Docker для всех сценариев разработки и продакшена.**

```bash
# 1. Скопируйте конфигурацию окружения
cp .env.example .env

# 2. Отредактируйте .env и укажите ваш API ключ
# AI_API_KEY=your-api-key-here

# 3. Соберите и запустите контейнеры
docker-compose up --build

# 4. Откройте http://localhost:5173 в браузере
```

Для остановки:
```bash
docker-compose down
```

## Архитектура

```
Browser (:5173) → React → Nginx proxy /api → Spring Boot (:8080) → AI API
```

- **Frontend**: React + Vite → Nginx (порт 5173)
- **Backend**: Spring Boot 3.2, Java 17, WebClient (порт 8080)
- **AI API**: OpenAI-compatible endpoint (настраивается через .env)

## Структура проекта

```
ai-chat/
├── ai-chat-backend/     # Spring Boot backend
│   ├── Dockerfile
│   ├── pom.xml
│   └── src/main/
│       ├── java/com/aichat/
│       │   ├── AiChatApplication.java
│       │   ├── config/
│       │   │   ├── AiChatProperties.java
│       │   │   └── WebConfig.java
│       │   ├── controller/
│       │   │   └── ChatController.java
│       │   ├── dto/
│       │   │   ├── ChatRequest.java
│       │   │   └── ChatResponse.java
│       │   └── service/
│       │       └── AiChatService.java
│       └── resources/
│           └── application.yml
└── ai-chat-frontend/    # React frontend
    ├── Dockerfile
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        └── index.css
```

## Переменные окружения

| Переменная | Значение по умолчанию | Описание |
|------------|----------------------|----------|
| `AI_API_KEY` | (требуется) | API ключ для доступа к ИИ |
| `AI_API_URL` | (требуется) | Базовый URL ИИ API |
| `AI_MODEL` | (требуется) | Название модели |

## API Endpoints

- `POST /api/chat` - Отправить сообщение, получить ответ ИИ
- `GET /api/chat/health` - Проверка работоспособности

## Особенности

- История сообщений сохраняется в рамках сессии браузера
- Проксирование запросов через Spring Boot (API ключ на сервере)
- Поддержка истории диалога
- Индикация загрузки при ожидании ответа
- CORS настроен через `allowedOriginPatterns` для работы с credentials

## Troubleshooting

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
2. Проверьте логи на предмет таймаутов: `docker logs ai-chat-backend | grep timeout`
3. Увеличьте таймаут в `application.yml` если AI API отвечает медленно

### Cannot connect to backend

**Причина**: Frontend в Docker не может достичь backend.

**Решение**:
1. Убедитесь что оба контейнера в одной сети: `docker network inspect demo_ai-chat-network`
2. Проверьте что backend слушает `0.0.0.0:8080`
3. Перезапустите контейнеры: `docker-compose restart`
