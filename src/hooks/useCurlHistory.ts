import { useState, useEffect } from 'react';

const STORAGE_KEY = 'curldiff-history';
export const MAX_HISTORY = 10;
/** Largest single entry we keep; a multi-megabyte -d body would blow the localStorage quota. */
const MAX_ENTRY_CHARS = 64 * 1024;

export interface CurlHistoryItem {
  id: string;
  command: string;
  localhostUrl: string;
  timestamp: number;
}

/**
 * Add an entry to the front, dropping any earlier copy of the same
 * comparison, and enforce the caps. Pure, so it is testable without React.
 *
 * Note what is stored: the verbatim command, including any Authorization,
 * Cookie or API-key header. It stays in this browser's localStorage and is
 * never sent anywhere, but it is readable by anyone at the machine.
 */
export function pushHistoryItem(prev: CurlHistoryItem[], item: CurlHistoryItem): CurlHistoryItem[] {
  if (item.command.length + item.localhostUrl.length > MAX_ENTRY_CHARS) return prev;
  const rest = prev.filter((p) => !(p.command === item.command && p.localhostUrl === item.localhostUrl));
  return [item, ...rest].slice(0, MAX_HISTORY);
}

function persist(items: CurlHistoryItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Quota exceeded or storage disabled: history is a convenience, never an error.
  }
}

export function useCurlHistory() {
  const [history, setHistory] = useState<CurlHistoryItem[]>([]);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
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
      const updated = pushHistoryItem(prev, newItem);
      persist(updated);
      return updated;
    });
  };

  const removeFromHistory = (id: string) => {
    setHistory(prev => {
      const updated = prev.filter(item => item.id !== id);
      persist(updated);
      return updated;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  return { history, saveToHistory, removeFromHistory, clearHistory };
}
