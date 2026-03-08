import { cn } from '@/lib/utils';
import { Terminal, FileText } from 'lucide-react';

export type AppMode = 'curl-diff' | 'text-diff';

interface AppTabsProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
}

export function AppTabs({ mode, onModeChange }: AppTabsProps) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-full bg-muted/60 border border-border/50">
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
        "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] active:scale-95",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-primary/10 hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
