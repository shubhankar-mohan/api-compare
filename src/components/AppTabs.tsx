import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Terminal, FileText } from 'lucide-react';

export type AppMode = 'curl-diff' | 'text-diff';

interface AppTabsProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
}

export function AppTabs({ mode, onModeChange }: AppTabsProps) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/50 border">
      <TabButton
        active={mode === 'curl-diff'}
        onClick={() => onModeChange('curl-diff')}
        icon={Terminal}
        label="API Compare"
      />
      <TabButton
        active={mode === 'text-diff'}
        onClick={() => onModeChange('text-diff')}
        icon={FileText}
        label="Text Compare"
      />
    </div>
  );
}

function TabButton({ 
  active, 
  onClick, 
  icon: Icon, 
  label 
}: { 
  active: boolean; 
  onClick: () => void; 
  icon: typeof Terminal; 
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all",
        active 
          ? "bg-card text-foreground shadow-sm" 
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
