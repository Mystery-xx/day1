# AI Chat Application - Docker

## Быстрый старт

1. Скопируйте `.env.example` в `.env`:
```bash
cp .env.example .env
```

2. Отредактируйте `.env` и укажите ваши значения переменных:
```bash
AI_API_KEY=your-api-key-here
AI_API_URL=https://your-ai-api.com/v1
AI_MODEL=qwen3.5-397b-a17b
```

3. Запустите контейнеры:
```bash
docker-compose up --build
```

4. Откройте http://localhost:80

## Остановка

```bash
docker-compose down
```

## Остановка с удалением данных

```bash
docker-compose down -v
```

## Просмотр логов

```bash
# Все логи
docker-compose logs -f

# Только backend
docker-compose logs -f backend

# Только frontend
docker-compose logs -f frontend
```

## Пересборка

```bash
docker-compose up --build
```

## Переменные окружения

| Переменная | Значение по умолчанию | Описание |
|-----------|----------------------|----------|
| `AI_API_KEY` | (требуется) | API ключ для доступа к ИИ |
| `AI_API_URL` | (требуется) | Базовый URL ИИ API |
| `AI_MODEL` | (требуется) | Модель ИИ |
| `AI_PROVIDER` | `gpustack` | Провайдер: `gpustack` или `huggingface` |
| `GPUSTACK_API_URL` | - | URL GPUStack API (опционально) |
| `HUGGINGFACE_API_URL` | `https://router.huggingface.co/v1` | URL HuggingFace API |
| `HUGGINGFACE_TOKEN` | (требуется для HF) | Токен HuggingFace |
| `AI_TEMPERATURE` | `0.7` | Температура генерации |
| `AI_MAX_TOKENS` | `1024` | Максимум токенов |
| `AI_TOP_P` | `1.0` | Top P sampling |

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

## Файлы

- `docker-compose.yml` - оркестрация контейнеров
- `ai-chat-backend/Dockerfile` - сборка Spring Boot
- `ai-chat-frontend/Dockerfile` - сборка React + Nginx
- `ai-chat-frontend/nginx.conf` - конфигурация Nginx (проксирование /api на backend)
- `ai-chat-backend/src/main/resources/application.yml` - конфигурация Spring Boot
- `.env.example` - шаблон переменных окружения

## Порты

| Сервис | Внутренний порт | Внешний порт | Описание |
|--------|----------------|--------------|----------|
| Frontend (Nginx) | 80 | 80 | Веб-интерфейс |
| Backend (Spring Boot) | 8080 | 8081 | REST API + AI интеграция |

**Примечание**: В Docker frontend обращается к backend через `backend:8080` (internal), а externally backend доступен на порту 8081.

## Логи

```bash
# Все логи
docker-compose logs -f

# Только backend
docker-compose logs -f backend

# Только frontend
docker-compose logs -f frontend
```
