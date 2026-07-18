# AGENTS.md - Frontend

## Tech Stack

- **React**: 18 (functional components, hooks)
- **Vite**: 5 (build tool, dev server)
- **Styling**: Custom CSS (no framework)
- **State**: React hooks (useState, useReducer)
- **HTTP**: Native fetch (no Axios)
- **Routing**: Custom route-based rendering

## Entry Points

```
index.html          # HTML entry (loads main.jsx)
└── main.jsx        # React entry (renders App)
    └── App.jsx     # Main component (route dispatcher)
        └── SearchPage.jsx  # Default route
```

## Project Structure

```
src/
├── App.jsx             # Route dispatcher
├── main.jsx            # React entry point
├── index.html          # HTML entry
├── components/         # React components
│   └── rag/           # RAG-specific components
├── hooks/              # Custom hooks
└── vite.config.js      # Vite configuration
```

## Conventions

### Component Style
- **File naming**: PascalCase (e.g., `SearchPage.jsx`)
- **Component naming**: PascalCase (e.g., `function SearchPage()`)
- **Hooks**: `use*` prefix (e.g., `useChat`, `useRAG`)
- **Exports**: Default exports for components

### Code Style
- **Functions**: Arrow functions for components
- **Props**: Destructured in function signature
- **State**: `useState` for local, custom hooks for shared
- **Effects**: `useEffect` with explicit dependency arrays

### File Organization
- **Components**: One component per file (usually)
- **Hooks**: Separate files in `hooks/` directory
- **CSS**: Co-located with components (same directory)

## RAG Components

The `components/rag/` sub-package contains RAG-specific components:
- Search interface
- Results display
- Document preview
- Vector search controls

Follow existing patterns when adding RAG components.

## API Integration

### Proxy Configuration
Vite proxies `/api` to backend:
```javascript
// vite.config.js
server: {
  proxy: {
    '/api': 'http://localhost:8082'
  }
}
```

### Fetch Pattern
```javascript
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Hello' })
});
const data = await response.json();
```

### Error Handling
```javascript
try {
  const response = await fetch('/api/chat');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
} catch (error) {
  // Handle error
}
```

## Docker Deployment

### Development
```bash
# Vite dev server (port 5173)
npm run dev
```

### Production
```bash
# Multi-stage Docker build
docker-compose build frontend && docker-compose up frontend
```

**IMPORTANT**: After ANY code change, rebuild Docker:
```bash
docker-compose up --build
```

Changes are NOT hot-reloaded into running containers.

## Anti-Patterns

### None Found
Frontend code is clean with no identified anti-patterns.

## Gotchas

1. **No api/ directory**: Frontend has no dedicated API client directory - fetch calls are inline
2. **No specialized AI libraries**: Raw fetch to backend proxy
3. **No routing library**: Custom route-based rendering in App.jsx
4. **No state management library**: Pure React hooks
5. **CORS**: Backend allows all origins - frontend makes direct fetch calls

## Key Files

| File | Purpose |
|------|---------|
| `App.jsx` | Route dispatcher |
| `SearchPage.jsx` | Default page component |
| `main.jsx` | React entry point |
| `vite.config.js` | Vite proxy config |
| `components/rag/**` | RAG components |

## Testing

No test suite configured. When adding tests:
- Use Vitest (Vite-native test runner)
- Place tests alongside components: `ComponentName.test.jsx`
- Use React Testing Library for component tests

## Build Notes

- **Build command**: `npm run build` → `dist/` directory
- **Dockerfile**: Multi-stage (Node build → Nginx serve)
- **Output**: Static files served by Nginx
- **Proxy**: Nginx proxies `/api` to backend service in production
