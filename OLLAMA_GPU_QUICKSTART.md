# Ollama GPU - Quick Start

## Что сделано

Добавлен сервис Ollama с GPU поддержкой в оба docker-compose файла:
- `docker-compose.yml` (порт 8082)
- `docker-compose-8081.yml` (порт 8081)

## Требования

### 1. NVIDIA Container Toolkit

**Ubuntu/Debian:**
```bash
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker
```

**Проверка:**
```bash
docker run --rm --runtime=nvidia --gpus all nvidia/cuda:12.0-base nvidia-smi
```

## Запуск

### Порт 8082 (по умолчанию)
```bash
docker-compose up --build
```

### Порт 8081 (альтернативный)
```bash
docker-compose -f docker-compose-8081.yml up --build
```

## Проверка GPU

```bash
# Проверка использования GPU
docker exec ollama ollama ps
# или для 8081
docker exec ollama-8081 ollama ps

# Должно показать: 100% GPU
```

## Настройка .env

```bash
# Для docker-compose.yml (порт 8082)
AI_API_URL=http://ollama:11434
AI_API_KEY=ollama
AI_MODEL=llama3.2
AI_PROVIDER=ollama

# Для docker-compose-8081.yml (порт 8081)
OLLAMA_API_URL=http://ollama:11434
OLLAMA_MODEL=llama3.2
```

## Первая загрузка модели

При первом запуске Ollama загрузит модель (2-4GB). Это займёт 5-15 минут в зависимости от интернета.

```bash
# Мониторинг загрузки
docker logs ollama -f
```

## Troubleshooting

**"runtime: nvidia" not found:**
```bash
sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker
```

**Ollama не использует GPU:**
1. Проверьте NVIDIA Container Toolkit: `docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi`
2. Проверьте логи: `docker logs ollama | grep -i gpu`

**Не хватает GPU памяти:**
Используйте меньшую модель:
```bash
docker exec ollama ollama pull llama3.2:1b
```

Полная документация: `OLLAMA_GPU_SETUP.md`
