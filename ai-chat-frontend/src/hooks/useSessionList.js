import { useState, useEffect, useCallback } from 'react';

export function useSessionList() {
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSessions = useCallback(async (limit = 50, offset = 0) => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(`/api/chat/sessions?limit=${limit}&offset=${offset}`);
      
      if (response.ok) {
        const data = await response.json();
        setSessions(data);
      } else {
        console.error('Failed to fetch sessions:', response.status);
        setError('Failed to load sessions');
        setSessions([]);
      }
    } catch (err) {
      console.error('Error fetching sessions:', err);
      setError('Failed to load sessions');
      setSessions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteSession = useCallback(async (sessionId) => {
    try {
      const response = await fetch(`/api/chat/history/${sessionId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        // Remove from local list
        setSessions(prev => prev.filter(s => s.sessionId !== sessionId));
        return true;
      } else {
        console.error('Failed to delete session:', response.status);
        return false;
      }
    } catch (err) {
      console.error('Error deleting session:', err);
      return false;
    }
  }, []);

  // Auto-fetch on mount
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return { sessions, isLoading, error, fetchSessions, deleteSession };
}
