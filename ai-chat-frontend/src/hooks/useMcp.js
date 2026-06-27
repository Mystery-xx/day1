import { useState, useCallback } from 'react';

export function useMcp() {
  const [servers, setServers] = useState([]);
  const [connectedServers, setConnectedServers] = useState(new Set());
  const [tools, setTools] = useState([]);
  const [status, setStatus] = useState('disconnected');
  const [error, setError] = useState(null);

  // Fetch all MCP servers
  const fetchServers = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch('/api/mcp/servers', {
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        setServers(data);
      } else {
        throw new Error(`Failed to fetch servers: ${response.status}`);
      }
    } catch (err) {
      setError(err.message);
      console.error('Error fetching MCP servers:', err);
    }
  }, []);

  // Fetch tools from all connected servers
  const fetchAllTools = useCallback(async () => {
    try {
      const allTools = [];
      
      for (const serverId of connectedServers) {
        try {
          const response = await fetch(`/api/mcp/servers/${serverId}/tools`);
          if (response.ok) {
            const toolsData = await response.json();
            allTools.push(...(toolsData.tools || []));
          }
        } catch (err) {
          console.warn(`Failed to fetch tools from server ${serverId}:`, err);
        }
      }
      
      setTools(allTools);
    } catch (err) {
      console.error('Error fetching all tools:', err);
    }
  }, [connectedServers]);

  // Add new MCP server
  const addServer = useCallback(async (serverData) => {
    try {
      setError(null);
      const response = await fetch('/api/mcp/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serverData)
      });

      if (response.ok) {
        const newServer = await response.json();
        setServers(prev => [...prev, newServer]);
        return newServer;
      } else {
        throw new Error(`Failed to add server: ${response.status}`);
      }
    } catch (err) {
      setError(err.message);
      console.error('Error adding MCP server:', err);
      throw err;
    }
  }, []);

  // Update existing MCP server
  const updateServer = useCallback(async (serverId, serverData) => {
    try {
      setError(null);
      const response = await fetch(`/api/mcp/servers/${serverId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serverData)
      });

      if (response.ok) {
        const updatedServer = await response.json();
        setServers(prev => prev.map(s => s.id === serverId ? updatedServer : s));
        return updatedServer;
      } else {
        throw new Error(`Failed to update server: ${response.status}`);
      }
    } catch (err) {
      setError(err.message);
      console.error('Error updating MCP server:', err);
      throw err;
    }
  }, []);

  // Delete MCP server
  const deleteServer = useCallback(async (serverId) => {
    try {
      setError(null);
      const response = await fetch(`/api/mcp/servers/${serverId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setServers(prev => prev.filter(s => s.id !== serverId));
        setConnectedServers(prev => {
          const next = new Set(prev);
          next.delete(serverId);
          return next;
        });
      } else {
        throw new Error(`Failed to delete server: ${response.status}`);
      }
    } catch (err) {
      setError(err.message);
      console.error('Error deleting MCP server:', err);
      throw err;
    }
  }, [connectedServers, fetchAllTools]);

  // Connect to MCP server
  const connect = useCallback(async (serverId) => {
    try {
      setError(null);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`/api/mcp/servers/${serverId}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (response.ok) {
        const result = await response.json();
        setConnectedServers(prev => new Set([...prev, serverId]));
        setStatus('connected');
        
        // Fetch tools from all connected servers
        await fetchAllTools();
        
        return result;
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || `Failed to connect: ${response.status}`);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Failed to connect: Timeout');
        setStatus('error');
      } else {
        setError(err.message);
        setStatus('error');
      }
      console.error('Error connecting to MCP server:', err);
      throw err;
    }
  }, []);

  // Disconnect from MCP server
  const disconnect = useCallback(async (serverId) => {
    try {
      setError(null);
      
      const response = await fetch(`/api/mcp/servers/${serverId}/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        setConnectedServers(prev => {
          const next = new Set(prev);
          next.delete(serverId);
          return next;
        });
        // Refresh tools from remaining connected servers
        await fetchAllTools();
      } else {
        throw new Error(`Failed to disconnect: ${response.status}`);
      }
    } catch (err) {
      setError(err.message);
      console.error('Error disconnecting from MCP server:', err);
      throw err;
    }
  }, []);

  // Invoke MCP tool with SSE streaming
  const invokeTool = useCallback(async (serverId, toolName, toolArgs, onProgress) => {
    try {
      setError(null);
      setTools([]);

      let parsedArgs = {};
      if (toolArgs) {
        try {
          if (typeof toolArgs === 'string') {
            parsedArgs = JSON.parse(toolArgs);
          } else {
            parsedArgs = toolArgs;
          }
        } catch (e) {
          const validationError = 'Invalid parameters';
          setError(validationError);
          throw new Error(validationError);
        }
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        setError('Tool execution timed out');
      }, 30000);

      const response = await fetch(`/api/mcp/servers/${serverId}/tools/${encodeURIComponent(toolName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedArgs),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || 'Tool execution failed');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      return new Promise((resolve, reject) => {
        const read = async () => {
          try {
            const { done, value } = await reader.read();
            if (done) {
              resolve({ type: 'complete' });
              return;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data:')) {
                try {
                  const data = JSON.parse(line.slice(5));
                  if (onProgress) {
                    onProgress(data);
                  }
                  
                  if (data.type === 'error') {
                    const errorMsg = data.data?.error || 'Tool execution failed';
                    setError(errorMsg);
                    reject(new Error(errorMsg));
                    return;
                  }
                  
                  if (data.type === 'result' || data.type === 'complete') {
                    resolve(data);
                    return;
                  }
                } catch (e) {
                  if (onProgress) {
                    onProgress({ type: 'message', data: line });
                  }
                }
              }
            }

            await read();
          } catch (err) {
            if (err.name === 'AbortError') {
              const timeoutMsg = 'Tool execution timed out';
              setError(timeoutMsg);
              reject(new Error(timeoutMsg));
            } else {
              setError(err.message);
              reject(err);
            }
          }
        };

        read();
      });
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
      }
      console.error('Error invoking MCP tool:', err);
      throw err;
    }
  }, []);

  return {
    servers,
    connectedServer,
    tools,
    status,
    error,
    fetchServers,
    addServer,
    updateServer,
    deleteServer,
    connect,
    disconnect,
    invokeTool
  };
}
