import { useState, useEffect, useCallback } from 'react';

export function useTaskState(sessionId) {
  const [taskState, setTaskState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load task state from backend when sessionId changes or refresh is triggered
  const loadTaskState = useCallback(async () => {
    if (!sessionId) {
      setTaskState(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}/task-state`);
      if (response.ok) {
        const data = await response.json();
        setTaskState(data);
      } else if (response.status === 404) {
        // Task state doesn't exist yet - that's OK, don't show error
        setTaskState(null);
      } else {
        throw new Error(`Failed to load task state: ${response.status}`);
      }
    } catch (err) {
      // Only show error if it's not 404 (already handled above)
      if (err.message && !err.message.includes('404')) {
        console.error('Error loading task state:', err);
        setError(err.message);
      }
      setTaskState(null);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadTaskState();
  }, [loadTaskState]);

  // Expose refresh function for manual triggers (e.g., after sendMessage)
  const refresh = useCallback(() => {
    return loadTaskState();
  }, [loadTaskState]);

  // Update goal via API call
  const updateGoal = useCallback(async (goal) => {
    if (!sessionId) {
      throw new Error('No session ID');
    }
    
    setError(null);
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}/task-state/goal`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal })
      });

      if (response.ok) {
        const updatedState = await response.json();
        setTaskState(updatedState);
        return updatedState;
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to update goal: ${response.status}`);
      }
    } catch (err) {
      setError(err.message);
      console.error('Error updating goal:', err);
      throw err;
    }
  }, [sessionId]);

  // Update status via API call
  const updateStatus = useCallback(async (status) => {
    if (!sessionId) {
      throw new Error('No session ID');
    }
    
    setError(null);
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}/task-state/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });

      if (response.ok) {
        const updatedState = await response.json();
        setTaskState(updatedState);
        return updatedState;
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to update status: ${response.status}`);
      }
    } catch (err) {
      setError(err.message);
      console.error('Error updating status:', err);
      throw err;
    }
  }, [sessionId]);

  // Add constraint via API call
  const addConstraint = useCallback(async (constraint) => {
    if (!sessionId) {
      throw new Error('No session ID');
    }
    
    setError(null);
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}/task-state/constraints`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(constraint)
      });

      if (response.ok) {
        const updatedState = await response.json();
        setTaskState(updatedState);
        return updatedState;
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to add constraint: ${response.status}`);
      }
    } catch (err) {
      setError(err.message);
      console.error('Error adding constraint:', err);
      throw err;
    }
  }, [sessionId]);

  return {
    taskState,
    loading,
    error,
    updateGoal,
    updateStatus,
    addConstraint,
    refresh
  };
}
