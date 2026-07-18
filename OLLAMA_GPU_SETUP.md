# Ollama GPU Setup

## Prerequisites

### 1. Install NVIDIA Container Toolkit

**Ubuntu/Debian:**
```bash
# Add NVIDIA repository
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

# Install
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit

# Restart Docker
sudo systemctl restart docker
```

**Verify installation:**
```bash
docker run --rm --runtime=nvidia --gpus all nvidia/cuda:12.0-base nvidia-smi
```

Should show your GPU info.

### 2. Pull Ollama Model

Before first run, pull the model you want to use:

```bash
# Option A: Run Ollama locally first to download model
ollama pull llama3.2

# Option B: Let Docker download it on first run (slower)
```

## Running with GPU

### Port 8082 (default deployment)

```bash
# Start all services including Ollama with GPU
docker-compose up --build

# Verify Ollama is using GPU
docker exec ollama ollama ps
# Or check logs:
docker logs ollama | grep -i gpu
```

### Port 8081 (alternative deployment)

```bash
# Start all services including Ollama with GPU
docker-compose -f docker-compose-8081.yml up --build

# Verify Ollama is using GPU
docker exec ollama-8081 ollama ps
```

## Verify GPU Usage

### Check Ollama GPU status:
```bash
# For port 8082 deployment
docker exec ollama ollama ps

# For port 8081 deployment
docker exec ollama-8081 ollama ps
```

Expected output should show GPU memory allocation:
```
NAME       ID           SIZE      PROCESSOR
llama3.2   a839709857   2.0 GB    100% GPU
```

### Check NVIDIA GPU usage:
```bash
nvidia-smi
```

Should show Docker/Ollama process using GPU memory.

### Test chat with Ollama:

1. Configure `.env`:
```bash
AI_API_URL=http://ollama:11434
AI_API_KEY=ollama
AI_MODEL=llama3.2
AI_PROVIDER=ollama
```

2. Restart backend:
```bash
docker-compose up --build backend
```

3. Open http://localhost:5173 and send a message.

## Configuration Changes Made

### docker-compose.yml & docker-compose-8081.yml

Added Ollama service with:
- `runtime: nvidia` - Enables NVIDIA GPU support
- `NVIDIA_VISIBLE_DEVICES=all` - Makes all GPUs visible to container
- `NVIDIA_DRIVER_CAPABILITIES=compute,utility` - Required CUDA capabilities
- GPU resource reservation in deploy section
- Volume for persistent model storage
- Network access for backend

### Environment Files

Updated `.env` and `.env-8081`:
- Changed `OLLAMA_API_URL` from `host.docker.internal:11434` to `ollama:11434`
- Added `OLLAMA_MODEL` variable
- Backend now connects to Ollama via Docker network

## Troubleshooting

### "runtime: nvidia" not found
```bash
# Install NVIDIA Container Toolkit (see above)
sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker
```

### Ollama container won't start
Check Docker logs:
```bash
docker logs ollama
# or
docker logs ollama-8081
```

### Backend can't connect to Ollama
Verify network connectivity:
```bash
docker exec ai-chat-backend ping ollama
# or for 8081
docker exec ai-chat-backend-8081 ping ollama-8081
```

### GPU not being used
1. Verify NVIDIA Container Toolkit: `docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi`
2. Check Ollama logs: `docker logs ollama | grep -i gpu`
3. Verify model is loaded: `docker exec ollama ollama ps`

### Out of GPU memory
Reduce model size or stop other GPU processes:
```bash
# Check GPU memory usage
nvidia-smi

# Stop unused containers
docker-compose down
```

## Performance Tips

1. **Use smaller models** for faster inference:
   ```bash
   docker exec ollama ollama pull llama3.2:1b  # 1B parameter model
   ```

2. **Keep models loaded** - Ollama keeps models in GPU memory by default after first load

3. **Monitor GPU usage**:
   ```bash
   watch -n 1 nvidia-smi
   ```

4. **Adjust concurrency** if backend overwhelms GPU:
   Edit backend application.yml to limit concurrent requests

## Switching Back to Host Ollama

If you want to use host Ollama instead of containerized:

1. Edit `docker-compose.yml`:
```yaml
# Comment out ollama service
# ollama:
#   image: ollama/ollama:latest
#   ...
```

2. Update `.env`:
```bash
OLLAMA_API_URL=http://host.docker.internal:11434
```

3. Restart:
```bash
docker-compose up --build
```
