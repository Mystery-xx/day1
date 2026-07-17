FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine

# Install git for git operations
RUN apk add --no-cache git

# Configure git to trust mounted volumes
RUN git config --global --add safe.directory /app/repo/*

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

# Create non-root user for security
RUN addgroup -S mcp && adduser -S -G mcp mcp

# Configure git safe.directory system-wide
RUN git config --system --add safe.directory /app/repo/*

RUN chown -R mcp:mcp /app
USER mcp

# Environment variables
ENV PORT=3000
ENV HOST=0.0.0.0
ENV INDEX_ROOT=/app/.index
ENV REPO_ROOT=/app/repo

# Create directories for persistence
RUN mkdir -p /app/.index /app/repo && chown -R mcp:mcp /app/.index /app/repo

EXPOSE 3000

CMD ["node", "dist/bin/http-server.js"]
