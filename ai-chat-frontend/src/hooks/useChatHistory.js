import { useState, useEffect } from 'react';

const HISTORY_KEY = 'chat_request_history';
const MAX_HISTORY_SIZE = 5;

export function useChatHistory() {
  const [history, setHistory] = useState([]);

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading chat history from localStorage:', error);
      setHistory([]);
    }
  }, []);

  // Add new entry to history
  const addEntry = (entry) => {
    try {
      setHistory(prevHistory => {
        const newHistory = [...prevHistory, entry];
        
        // Keep only last MAX_HISTORY_SIZE entries
        if (newHistory.length > MAX_HISTORY_SIZE) {
          const trimmed = newHistory.slice(newHistory.length - MAX_HISTORY_SIZE);
          localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
          return trimmed;
        } else {
          localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
          return newHistory;
        }
      });
    } catch (error) {
      console.error('Error saving chat history to localStorage:', error);
    }
  };

  // Clear history
  const clearHistory = () => {
    try {
      localStorage.removeItem(HISTORY_KEY);
      setHistory([]);
    } catch (error) {
      console.error('Error clearing chat history:', error);
    }
  };

  return { history, addEntry, clearHistory };
}
