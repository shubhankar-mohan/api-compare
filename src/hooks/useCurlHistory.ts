import { useState, useEffect } from 'react';

const STORAGE_KEY = 'curldiff-history';
const MAX_HISTORY = 10;

export interface CurlHistoryItem {
  id: string;
  command: string;
  localhostUrl: string;
  timestamp: number;
  label?: string;
}

export function useCurlHistory() {
  const [history, setHistory] = useState<CurlHistoryItem[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setHistory(JSON.parse(stored));
      } catch {
        setHistory([]);
      }
    }
  }, []);

  const saveToHistory = (command: string, localhostUrl: string) => {
    const newItem: CurlHistoryItem = {
      id: Date.now().toString(),
      command,
      localhostUrl,
      timestamp: Date.now(),
    };

    setHistory(prev => {
      // Check if command already exists
      const exists = prev.find(item => item.command === command);
      let updated: CurlHistoryItem[];
      
      if (exists) {
        // Move to top and update timestamp
        updated = [
          { ...exists, timestamp: Date.now(), localhostUrl },
          ...prev.filter(item => item.command !== command)
        ];
      } else {
        updated = [newItem, ...prev].slice(0, MAX_HISTORY);
      }
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const removeFromHistory = (id: string) => {
    setHistory(prev => {
      const updated = prev.filter(item => item.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  return { history, saveToHistory, removeFromHistory, clearHistory };
}
