import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, Download, Upload, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  type NoiseRule,
  forgetRule,
  loadRules,
  saveRules,
  exportRulesFile,
  parseRulesFile,
  canonicalizeEndpoint,
} from '@/lib/noiseRules';

interface RulesViewerProps {
  /** Raw endpoint URL (will be canonicalized internally). */
  endpoint: string;
  /** Current rules — passed in to keep the panel in sync with DiffViewer state. */
  rules: NoiseRule[];
  /** Called after a rule mutation so DiffViewer reloads + recomputes. */
  onRulesChanged: () => void;
}

/**
 * Format a ms-epoch timestamp as a short relative string ("2m ago").
 * Pure function for testability — extracted so tests can probe edge cases.
 */
export function formatRelativeTime(epochMs: number, now: number = Date.now()): string {
  const delta = Math.max(0, now - epochMs);
  const sec = Math.floor(delta / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month}mo ago`;
  const year = Math.floor(day / 365);
  return `${year}y ago`;
}

/**
 * Truncate a long endpoint for display (per CEO plan v3 N3).
 * `host.com:8080/v1/users/123/orders` → `host.com/…/orders`.
 */
function shortEndpoint(endpoint: string): string {
  const canonical = canonicalizeEndpoint(endpoint);
  if (!canonical) return '(no endpoint)';
  if (canonical.length <= 40) return canonical;
  const slashIdx = canonical.indexOf('/');
  if (slashIdx === -1) return canonical.slice(0, 40);
  const host = canonical.slice(0, Math.min(slashIdx, 20));
  const lastSeg = canonical.split('/').filter(Boolean).pop() || '';
  return `${host}/…/${lastSeg}`;
}

export function RulesViewer({ endpoint, rules, onRulesChanged }: RulesViewerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canonical = canonicalizeEndpoint(endpoint);
  const ruleCount = rules.length;
  const triggerLabel = canonical
    ? `${shortEndpoint(endpoint)} · ${ruleCount} taught`
    : `${ruleCount} taught`;

  const handleForget = (path: string) => {
    if (!canonical) return;
    const result = forgetRule(canonical, path);
    if (!result.ok) {
      toast({ title: 'Could not forget rule', description: result.error, variant: 'destructive' });
      return;
    }
    onRulesChanged();
    toast({ title: 'Rule forgotten', description: `DiffChecker no longer ignores ${path}.` });
  };

  const handleExport = () => {
    if (!canonical) {
      toast({
        title: 'No endpoint to export',
        description: 'Run a diff first so DiffChecker knows which endpoint to export rules for.',
        variant: 'destructive',
      });
      return;
    }
    const file = exportRulesFile(canonical);
    const json = JSON.stringify(file, null, 2);
    const safeName = canonical.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.diffchecker.rules.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: 'Rules exported', description: `${ruleCount} rule${ruleCount === 1 ? '' : 's'} downloaded.` });
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseRulesFile(text);
      if (!parsed.ok) {
        toast({ title: 'Could not import file', description: parsed.error, variant: 'destructive' });
        return;
      }
      if (!canonical) {
        toast({
          title: 'No endpoint to import to',
          description: 'Run a diff first so DiffChecker knows which endpoint to import rules into.',
          variant: 'destructive',
        });
        return;
      }
      // Merge: dedupe by path, imported wins
      const existing = loadRules(canonical);
      const incomingPaths = new Set(parsed.file.rules.map((r) => r.path));
      const kept = existing.filter((r) => !incomingPaths.has(r.path));
      const merged = [...kept, ...parsed.file.rules];
      const replacedCount = existing.length - kept.length;
      const result = saveRules(canonical, merged);
      if (!result.ok) {
        toast({ title: 'Could not save imported rules', description: result.error, variant: 'destructive' });
        return;
      }
      onRulesChanged();
      toast({
        title: 'Rules imported',
        description: `${parsed.file.rules.length} rules merged${replacedCount ? `, ${replacedCount} replaced` : ''}.`,
      });
    } catch (err) {
      toast({
        title: 'Could not import file',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      // Allow re-importing the same file in the same session
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 max-w-[260px]" title="Rules taught for this endpoint">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="hidden sm:inline truncate">{triggerLabel}</span>
          <span className="sm:hidden">{ruleCount}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px]" align="end">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1 min-w-0">
              <h4 className="font-semibold text-sm">What you've taught DiffChecker on this endpoint</h4>
              <p className="text-xs text-muted-foreground truncate" title={canonical}>
                {canonical || '(no endpoint detected)'}
              </p>
            </div>
            <div className="flex flex-shrink-0 gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 gap-1"
                onClick={handleExport}
                disabled={ruleCount === 0}
                title="Export rules as a .diffchecker.rules.json file"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Export</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 gap-1"
                onClick={handleImportClick}
                title="Import a .diffchecker.rules.json file"
              >
                <Upload className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Import</span>
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handleImportFile}
              />
            </div>
          </div>

          <ScrollArea className="max-h-[360px]">
            {ruleCount === 0 ? (
              <div className="py-8 text-center">
                <Sparkles className="mx-auto h-6 w-6 text-muted-foreground/50 mb-2" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  Nothing taught yet. Click a chip on a noisy field to start.
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {rules
                  .slice()
                  .sort((a, b) => b.createdAt - a.createdAt)
                  .map((rule) => (
                    <li
                      key={`${rule.path}::${rule.type}`}
                      className="flex items-start justify-between gap-2 p-2 rounded-md border bg-card hover:bg-muted/40 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
                            {rule.type}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 capitalize"
                            title={rule.source === 'auto' ? 'Auto-suggested by classifier' : 'Added manually by you'}
                          >
                            {rule.source}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {formatRelativeTime(rule.createdAt)}
                          </span>
                        </div>
                        <code className="text-xs font-mono text-foreground/80 break-all">{rule.path}</code>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-muted-foreground hover:text-destructive"
                        onClick={() => handleForget(rule.path)}
                        title="Stop ignoring this field"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Forget
                      </Button>
                    </li>
                  ))}
              </ul>
            )}
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}
