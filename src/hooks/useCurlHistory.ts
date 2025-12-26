import { useState, useEffect } from 'react';

const STORAGE_KEY = 'curldiff-history';
const MAX_HISTORY = 10;

export interface CurlHistoryItem {
  id: string;
  command: string;
  localhostUrl: string;
  timestamp: number;
  label: string;
}

function extractPathFromCurl(command: string): string {
  // Extract URL from curl command
  const urlMatch = command.match(/['"]?(https?:\/\/[^\s'"]+)['"]?/);
  if (!urlMatch) return 'Unknown';
  
  try {
    const url = new URL(urlMatch[1]);
    const path = url.pathname + url.search;
    // Clean up and truncate
    const cleanPath = path === '/' ? url.hostname.split('.')[0] : path;
    return cleanPath.length > 30 ? cleanPath.substring(0, 30) + '...' : cleanPath;
  } catch {
    return 'Unknown';
  }
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
      label: extractPathFromCurl(command),
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
