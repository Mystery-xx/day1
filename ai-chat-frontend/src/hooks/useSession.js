import { useState, useEffect, useCallback } from 'react';

const SESSION_KEY = 'chat_current_session';

export function useSession() {
  const [sessionId, setSessionId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load or create session on mount
  useEffect(() => {
    const loadOrCreateSession = async () => {
      try {
        // Try to load from localStorage first (migration support)
        const stored = localStorage.getItem(SESSION_KEY);
        if (stored) {
          setSessionId(stored);
        } else {
          // Create new session via API
          const response = await fetch('/api/chat/history/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });

          if (response.ok) {
            const data = await response.json();
            setSessionId(data.sessionId);
            localStorage.setItem(SESSION_KEY, data.sessionId);
          }
        }
      } catch (error) {
        console.error('Error creating session:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadOrCreateSession();
  }, []);

  // Create new session
  const createNewSession = useCallback(async () => {
    try {
      const response = await fetch('/api/chat/history/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        setSessionId(data.sessionId);
        localStorage.setItem(SESSION_KEY, data.sessionId);

        // Clear sticky facts for new session (ignore errors)
        await fetch(`/api/chat/sessions/${data.sessionId}/sticky-facts`, {
          method: 'DELETE'
        }).catch(() => {});

        return data.sessionId;
      }
    } catch (error) {
      console.error('Error creating new session:', error);
    }
    return null;
  }, []);

  // Clear current session
  const clearSession = useCallback(() => {
    setSessionId(null);
    localStorage.removeItem(SESSION_KEY);
  }, []);

  return { sessionId, isLoading, createNewSession, clearSession };
}
