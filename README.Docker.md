# AI Chat Application - Docker

## Быстрый старт

1. Скопируйте `.env.example` в `.env`:
```bash
cp .env.example .env
```

2. Отредактируйте `.env` и укажите ваши значения переменных

3. Запустите контейнеры:
```bash
docker-compose up --build
```

4. Откройте http://localhost:5173

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
| `AI_API_URL` | (требуется) | URL API |
| `AI_MODEL` | (требуется) | Модель ИИ |
| `DOCKER_FRONTEND_PORT` | `5173` | Порт frontend |
| `DOCKER_BACKEND_PORT` | `8080` | Порт backend |

## Архитектура

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Browser    │────▶│   Frontend   │────▶│   Backend    │
│ :5173       │     │   (Nginx)    │     │ (Spring Boot)│
└─────────────┘     │   :80        │     │   :8080      │
                    └──────────────┘     └──────┬───────┘
                                                │
                                                ▼
                                         ┌──────────────┐
                                         │   AI API     │
                                         │ gpustack...  │
                                         └──────────────┘
```

## Файлы

- `docker-compose.yml` - оркестрация контейнеров
- `ai-chat-backend/Dockerfile` - сборка Spring Boot
- `ai-chat-frontend/Dockerfile` - сборка React + Nginx
- `ai-chat-frontend/nginx.conf` - конфигурация Nginx (проксирование /api на backend)
