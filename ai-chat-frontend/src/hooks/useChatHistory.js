import { useState, useEffect, useCallback } from 'react';

export function useChatHistory(sessionId) {
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load history from backend when sessionId changes
  useEffect(() => {
    if (!sessionId) {
      setHistory([]);
      return;
    }

    const loadHistory = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/chat/history/${sessionId}`);
        if (response.ok) {
          const data = await response.json();
          setHistory(data);
        }
      } catch (error) {
        console.error('Error loading chat history:', error);
        setHistory([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadHistory();
  }, [sessionId]);

  // Refresh history from backend
  const refresh = useCallback(async () => {
    if (!sessionId) {
      setHistory([]);
      return;
    }
    try {
      const response = await fetch(`/api/chat/history/${sessionId}`);
      if (response.ok) {
        const data = await response.json();
        setHistory(data);
      }
    } catch (error) {
      console.error('Error refreshing history:', error);
    }
  }, [sessionId]);

  // Add entry to history (now saves to backend via API)
  const addEntry = useCallback(async (entry) => {
    // Note: Messages are now saved automatically by the backend during sendMessage
    // This function can be used for analytics or local state updates
    setHistory(prev => [...prev, entry]);
  }, []);

  // Clear history for current session
  const clearHistory = useCallback(async () => {
    if (!sessionId) return;
    
    try {
      const response = await fetch(`/api/chat/history/${sessionId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        setHistory([]);
      }
    } catch (error) {
      console.error('Error clearing chat history:', error);
    }
  }, [sessionId]);

  return { history, isLoading, addEntry, clearHistory, refresh };
}
