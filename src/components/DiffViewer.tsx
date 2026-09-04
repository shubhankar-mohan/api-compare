import { useMemo, useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Minus, Plus, Globe, Server, Code2, Rows3, FoldVertical, GitBranch, TrendingUp, GitMerge, Sparkles, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { ApiResponse } from '@/lib/requestExecutor';
import { computeDiff, formatJson, formatHeaders, precisionWarnings, DiffLine, DiffSegment } from '@/lib/diffAlgorithm';
import {
  computeEnhancedDiff,
  DiffOptions,
  EnhancedDiffResult,
  searchInDiff,
  navigateToPath
} from '@/lib/enhancedDiffAlgorithm';
import {
  loadRules,
  saveRules,
  addRule,
  canonicalizeEndpoint,
  type NoiseRule,
  type NoiseClassifier,
} from '@/lib/noiseRules';
import { cn } from '@/lib/utils';
import { JsonSyntaxHighlight } from './JsonSyntaxHighlight';
import { FoldableJson } from './FoldableJson';
import { DiffOptionsPanel, DiffSearchBar } from './DiffOptions';
import { RulesViewer } from './RulesViewer';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MergeView } from './MergeView';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface DiffViewerProps {
  original: ApiResponse;
  localhost: ApiResponse;
}

// ────────────────────────────────────────────────────────────────────────────
// Noise metadata
//
// `DiffLine.noise` and `DiffLine.fieldKey` are set by the diff engine and read
// directly. They used to be encoded as `/* NOISE:<type>:<source> */` text
// appended to `content` and re-parsed here — which meant a response containing
// that literal string could forge one: this renderer would strip the "marker"
// out of the user's own data and show a real difference as suppressed noise.
// Line content is now rendered verbatim, exactly as the server sent it.

/**
 * Truncate a long endpoint for toast display (per CEO plan v3 N3).
 * `host.com:8080/v1/users/123/orders` → `host.com/…/orders`.
 */
function truncateEndpoint(endpoint: string): string {
  if (!endpoint) return '';
  if (endpoint.length <= 40) return endpoint;
  const slashIdx = endpoint.indexOf('/');
  if (slashIdx === -1) return endpoint.slice(0, 40);
  const host = endpoint.slice(0, Math.min(slashIdx, 20));
  const lastSeg = endpoint.split('/').filter(Boolean).pop() || '';
  return `${host}/…/${lastSeg}`;
}

function InlineSegments({ segments, side }: { segments: DiffSegment[]; side: 'left' | 'right' }) {
  return (
    <>
      {segments.map((seg, idx) => {
        if (seg.type === 'unchanged') {
          return <span key={idx}>{seg.text}</span>;
        }
        if (side === 'left' && seg.type === 'removed') {
          return (
            <span 
              key={idx} 
              className="bg-red-200 dark:bg-red-900/40 text-red-800 dark:text-red-200"
            >
              {seg.text}
            </span>
          );
        }
        if (side === 'right' && seg.type === 'added') {
          return (
            <span 
              key={idx} 
              className="bg-green-200 dark:bg-green-900/40 text-green-800 dark:text-green-200"
            >
              {seg.text}
            </span>
          );
        }
        return <span key={idx}>{seg.text}</span>;
      })}
    </>
  );
}

function DiffLineComponent({
  line,
  side,
  isJson,
  isHighlighted = false,
  lineIndex,
  onTeach,
  isShowAnyway,
  onToggleShowAnyway,
  isFocused,
  onFocus,
}: {
  line: DiffLine;
  side: 'left' | 'right';
  isJson?: boolean;
  isHighlighted?: boolean;
  lineIndex?: number;
  /** Called when the user clicks a "Teach" chip on this line. Receives the
   *  classifier type detected on the field. No-op when undefined. */
  onTeach?: (markerType: NoiseClassifier, fieldKey: string | null) => void;
  /** When true, a `rule` marker on this line is being one-shot revealed. */
  isShowAnyway?: boolean;
  onToggleShowAnyway?: () => void;
  /** True when this line currently has keyboard focus (drives `i` shortcut). */
  isFocused?: boolean;
  onFocus?: () => void;
}) {
  const autoMarker = line.noise?.source === 'auto' ? line.noise : undefined;
  const ruleMarker = line.noise?.source === 'rule' ? line.noise : undefined;
  const legacyMarker = line.noise?.source === 'legacy' ? line.noise : undefined;
  // Greyed when suppression actually applied — by a saved rule, or by the
  // opt-in legacy heuristic — and the user hasn't toggled show-anyway.
  const noiseApplied = !!(ruleMarker || legacyMarker) && !isShowAnyway;

  const bgClass = {
    added: 'bg-[hsl(var(--diff-added-bg))]',
    removed: 'bg-[hsl(var(--diff-removed-bg))]',
    modified: 'bg-yellow-50 dark:bg-yellow-900/10', // Subtle background for modified lines
    unchanged: '',
    empty: 'bg-muted/30',
  }[line.type];

  const textClass = {
    added: 'text-[hsl(var(--diff-added))]',
    removed: 'text-[hsl(var(--diff-removed))]',
    modified: '',
    unchanged: 'text-foreground',
    empty: '',
  }[line.type];

  return (
    <div
      className={cn(
        'flex font-mono text-sm transition-all group',
        bgClass,
        noiseApplied && 'opacity-50',
        isHighlighted && 'ring-2 ring-accent ring-offset-1 bg-accent/10',
        isFocused && 'outline outline-2 outline-primary/40 -outline-offset-2'
      )}
      id={`diff-line-${side}-${lineIndex}`}
      tabIndex={onFocus ? 0 : undefined}
      onFocus={onFocus}
      data-focused={isFocused ? 'true' : undefined}
      data-noise-applied={noiseApplied ? 'true' : undefined}
    >
      <div className="w-12 flex-shrink-0 px-2 py-0.5 text-right text-[hsl(var(--diff-line-number))] bg-[hsl(var(--diff-line-number-bg))] select-none border-r border-border">
        {line.lineNumber ?? ''}
      </div>
      <div className="w-6 flex-shrink-0 flex items-center justify-center text-xs">
        {(line.type === 'added' || (line.type === 'modified' && side === 'right')) && (
          <Plus className="h-3 w-3 text-[hsl(var(--diff-added))]" />
        )}
        {(line.type === 'removed' || (line.type === 'modified' && side === 'left')) && (
          <Minus className="h-3 w-3 text-[hsl(var(--diff-removed))]" />
        )}
      </div>
      <pre className={cn('flex-1 px-2 py-0.5 overflow-x-auto whitespace-pre', textClass)}>
        {line.type === 'modified' && line.segments ? (
          <InlineSegments
            segments={line.segments}
            side={side}
          />
        ) : isJson && line.type === 'unchanged' ? (
          <JsonSyntaxHighlight content={line.content || ' '} />
        ) : (
          line.content || ' '
        )}
        {/* Auto chip — only render on the right side to avoid duplication */}
        {autoMarker && side === 'right' && onTeach && (
          <Badge
            variant="outline"
            className="ml-2 cursor-pointer gap-1 px-2 py-0 text-[10px] font-normal border-primary/40 text-primary hover:bg-primary/10 align-middle"
            onClick={() => onTeach(autoMarker.type as NoiseClassifier, line.fieldKey ?? null)}
            title={`Teach DiffChecker that ${autoMarker.type} fields are noise on this endpoint`}
          >
            <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
            Teach: {autoMarker.type} is noise here
          </Badge>
        )}
        {/* Rule applied → "Show anyway" inline button */}
        {ruleMarker && side === 'right' && onToggleShowAnyway && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-2 h-5 px-2 py-0 text-[10px] font-normal text-muted-foreground hover:text-foreground"
            onClick={onToggleShowAnyway}
            title="Reveal this field for this diff only — does not delete the rule"
          >
            {isShowAnyway ? (
              <>
                <EyeOff className="h-2.5 w-2.5 mr-1" aria-hidden="true" />
                Hide again
              </>
            ) : (
              <>
                <Eye className="h-2.5 w-2.5 mr-1" aria-hidden="true" />
                Show once (don't forget the rule)
              </>
            )}
          </Button>
        )}
      </pre>
    </div>
  );
}

function DiffPanel({
  title,
  lines,
  lineCount,
  additions,
  removals,
  side,
  content,
  icon: Icon,
  accentColor,
  isJson = false,
  highlightedLine,
  showOnlyDifferences = false,
  onTeach,
  showAnywaySet,
  onToggleShowAnyway,
  focusedLine,
  onFocusLine,
}: {
  title: string;
  lines: DiffLine[];
  lineCount: number;
  additions?: number;
  removals?: number;
  side: 'left' | 'right';
  content: string;
  icon: typeof Globe;
  accentColor: 'primary' | 'accent';
  isJson?: boolean;
  highlightedLine?: { line: number; side: 'left' | 'right' } | null;
  showOnlyDifferences?: boolean;
  onTeach?: (markerType: NoiseClassifier, fieldKey: string | null) => void;
  showAnywaySet?: Set<number>;
  onToggleShowAnyway?: (lineIndex: number) => void;
  focusedLine?: { line: number; side: 'left' | 'right' } | null;
  onFocusLine?: (lineIndex: number) => void;
}) {
  // Filter lines if showing only differences
  const displayLines = showOnlyDifferences 
    ? lines.filter(line => line.type !== 'unchanged')
    : lines;
  const copyToClipboard = () => {
    navigator.clipboard.writeText(content);
    toast({
      title: 'Copied!',
      description: 'Content copied to clipboard',
    });
  };

  const lineText = lineCount === 1 ? '1 line' : `${lineCount} lines`;

  return (
    <div className="flex flex-col min-w-0">
      <div className={cn(
        "flex items-center justify-between p-3 border-b sticky top-0 z-10",
        accentColor === 'primary' ? 'bg-gradient-to-r from-primary/10 to-card' : 'bg-gradient-to-r from-accent/10 to-card'
      )}>
        <div className="flex items-center gap-2">
          <div className={cn(
            "p-1.5 rounded-lg",
            accentColor === 'primary' ? 'bg-primary/10' : 'bg-accent/10'
          )}>
            <Icon className={cn(
              "h-4 w-4",
              accentColor === 'primary' ? 'text-primary' : 'text-accent'
            )} />
          </div>
          <span className="font-semibold text-sm">{title}</span>
          {side === 'left' && removals !== undefined && removals > 0 && (
            <Badge variant="destructive" className="gap-1 text-xs">
              <Minus className="h-3 w-3" />
              {removals}
            </Badge>
          )}
          {side === 'right' && additions !== undefined && additions > 0 && (
            <Badge variant="success" className="gap-1 text-xs">
              <Plus className="h-3 w-3" />
              {additions}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">{lineText}</span>
          <Button variant="ghost" size="sm" onClick={copyToClipboard} className="h-7 px-2 hover:bg-muted">
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="min-w-0">
        {displayLines.map((line, idx) => {
          const originalIndex = lines.indexOf(line);
          const isHighlighted = highlightedLine?.side === side && highlightedLine?.line === originalIndex;
          const isFocused = focusedLine?.side === side && focusedLine?.line === originalIndex;

          return (
            <DiffLineComponent
              key={idx}
              line={line}
              side={side}
              isJson={isJson}
              isHighlighted={isHighlighted}
              lineIndex={originalIndex}
              onTeach={onTeach}
              isShowAnyway={showAnywaySet?.has(originalIndex)}
              onToggleShowAnyway={onToggleShowAnyway ? () => onToggleShowAnyway(originalIndex) : undefined}
              isFocused={isFocused}
              onFocus={onFocusLine ? () => onFocusLine(originalIndex) : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

export function DiffViewer({ original, localhost }: DiffViewerProps) {
  const [viewMode, setViewMode] = useState<'diff' | 'foldable' | 'merge'>('diff');
  const [diffOptions, setDiffOptions] = useState<DiffOptions>({});
  const [searchResults, setSearchResults] = useState<ReturnType<typeof searchInDiff>>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [pathInput, setPathInput] = useState('');
  const [highlightedLine, setHighlightedLine] = useState<{ line: number; side: 'left' | 'right' } | null>(null);
  const [showMergeDialog, setShowMergeDialog] = useState(false);

  // ──────────────────────────────────────────────────────────────────────
  // Noise-aware state
  //
  // - `endpointKey` is the canonicalized URL we use as the rule storage key
  // - `endpointRules` is the live rule set; reloaded on mount + on changes
  // - `rulesVersion` is bumped to re-trigger the diff after a rule add/remove
  // - `showAnywaySet` holds line indices that have been one-shot revealed
  //   (right side; we mirror to left because the indices align after diff)
  // - `focusedLine` tracks which row currently has keyboard focus for
  //   the `i` shortcut (Step 7).
  const endpointKey = useMemo(
    () => canonicalizeEndpoint(original.url || ''),
    [original.url]
  );
  const [endpointRules, setEndpointRules] = useState<NoiseRule[]>([]);
  const [rulesVersion, setRulesVersion] = useState(0);
  const [showAnywaySet, setShowAnywaySet] = useState<Set<number>>(new Set());
  const [focusedLine, setFocusedLine] = useState<{ line: number; side: 'left' | 'right' } | null>(null);

  // Load rules whenever the endpoint changes
  useEffect(() => {
    if (endpointKey) {
      setEndpointRules(loadRules(endpointKey));
    } else {
      setEndpointRules([]);
    }
    // Compare clears the per-diff override (rules persist; overrides don't)
    setShowAnywaySet(new Set());
  }, [endpointKey, original.body, localhost.body]);

  // Calculate content size for advanced mode auto-detection
  const contentSize = useMemo(() => {
    const leftLines = original.body.split('\n').length;
    const rightLines = localhost.body.split('\n').length;
    return Math.max(leftLines, rightLines);
  }, [original.body, localhost.body]);

  // Use enhanced diff when options are set, otherwise fall back to basic diff
  const bodyDiff = useMemo(() => {
    const leftFormatted = formatJson(original.body);
    const rightFormatted = formatJson(localhost.body);

    // Check if any options are enabled
    const hasOptions = diffOptions.semanticComparison ||
                      diffOptions.ignoreCase ||
                      diffOptions.ignoreWhitespace ||
                      diffOptions.detectArrayMoves ||
                      (diffOptions.ignoreKeys && diffOptions.ignoreKeys.length > 0) ||
                      (diffOptions.ignorePaths && diffOptions.ignorePaths.length > 0);

    // Precision warnings are derived from the RAW bodies. `formatJson` above
    // already round-trips through JSON.parse, which is exactly where an
    // oversized integer is rounded — by then there is nothing left to detect.
    const warnings = precisionWarnings(original.body, localhost.body);
    // Replace rather than append. The engine also scans the text it was handed,
    // but that text has already been through formatJson, so its warning names
    // the *rounded* literal ("...800 -> ...800") which reads as nonsense. The
    // raw scan knows the original values, so it wins.
    const withWarnings = <T extends { warnings?: string[] }>(result: T): T =>
      warnings.length > 0 ? { ...result, warnings } : result;

    if (hasOptions || diffOptions.advancedMode !== false) {
      return withWarnings(
        computeEnhancedDiff(leftFormatted, rightFormatted, diffOptions, endpointRules) as EnhancedDiffResult
      );
    } else {
      return withWarnings(
        computeDiff(leftFormatted, rightFormatted, { advancedMode: diffOptions.advancedMode, rules: endpointRules })
      );
    }
    // rulesVersion forces a recompute even when endpointRules reference hasn't changed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [original.body, localhost.body, diffOptions, endpointRules, rulesVersion]);

  // ──────────────────────────────────────────────────────────────────────
  // Noise actions: teach (add rule) and toggle "show anyway"
  const handleTeach = useCallback(
    (markerType: NoiseClassifier, fieldKey: string | null) => {
      if (!endpointKey) {
        toast({
          title: 'Cannot save rule',
          description: 'No endpoint URL detected for this diff.',
          variant: 'destructive',
        });
        return;
      }
      // Build the rule path: prefer a wildcard descendant match so the rule
      // applies regardless of nesting depth (a UUID under `$.data.user.id`
      // and one under `$.id` should both be ignored after one click).
      //
      // Rows without a field key are array elements. The old fallback here was
      // `$..*`, which matches every path — it silently failed to compile, so
      // the rule listed as "taught" and never matched anything. There is no
      // sensible rule to write for such a row, so say so instead.
      if (!fieldKey) {
        toast({
          title: 'Nothing to teach here',
          description: 'This row is an array element, not a named field. Teach on a field instead.',
        });
        return;
      }
      const path = `$..${fieldKey}`;
      const rule: NoiseRule = {
        path,
        type: markerType,
        source: 'manual',
        createdAt: Date.now(),
      };
      const result = addRule(endpointKey, rule);
      if (!result.ok) {
        toast({
          title: 'Could not save rule',
          description: result.error,
          variant: 'destructive',
        });
        return;
      }
      setEndpointRules(loadRules(endpointKey));
      setRulesVersion((v) => v + 1);
      toast({
        title: 'DiffChecker learned',
        description: `${markerType} fields are noise on ${truncateEndpoint(endpointKey)}.`,
      });
    },
    [endpointKey]
  );

  const handleToggleShowAnyway = useCallback((lineIndex: number) => {
    setShowAnywaySet((prev) => {
      const next = new Set(prev);
      if (next.has(lineIndex)) {
        next.delete(lineIndex);
      } else {
        next.add(lineIndex);
      }
      return next;
    });
  }, []);

  // Forget a rule by direct path (used by `i` toggle when a rule already exists)
  const handleForgetByPath = useCallback(
    (path: string) => {
      if (!endpointKey) return;
      const existing = loadRules(endpointKey);
      const next = existing.filter((r) => r.path !== path);
      const result = saveRules(endpointKey, next);
      if (!result.ok) {
        toast({ title: 'Could not forget rule', description: result.error, variant: 'destructive' });
        return;
      }
      setEndpointRules(loadRules(endpointKey));
      setRulesVersion((v) => v + 1);
      toast({ title: 'Rule forgotten', description: `DiffChecker no longer ignores ${path}.` });
    },
    [endpointKey]
  );

  const headersDiff = useMemo(() => {
    const leftHeaders = formatHeaders(original.headers);
    const rightHeaders = formatHeaders(localhost.headers);
    return computeDiff(leftHeaders, rightHeaders, { advancedMode: diffOptions.advancedMode });
  }, [original.headers, localhost.headers, diffOptions.advancedMode]);
  
  // Handle search
  const handleSearch = (query: string, options: { caseSensitive?: boolean; regex?: boolean }) => {
    const enhancedDiff = bodyDiff as EnhancedDiffResult;
    let results: ReturnType<typeof searchInDiff>;
    try {
      results = searchInDiff(enhancedDiff, query, options);
    } catch (err) {
      toast({ title: 'Search failed', description: String(err instanceof Error ? err.message : err), variant: 'destructive' });
      return;
    }
    setSearchResults(results);
    setCurrentSearchIndex(0);
    
    if (results.length > 0) {
      setHighlightedLine({ line: results[0].line, side: results[0].side });
      toast({
        title: `Found ${results.length} match${results.length !== 1 ? 'es' : ''}`,
        description: 'Use arrows to navigate between results'
      });
    } else {
      toast({
        title: 'No matches found',
        variant: 'destructive'
      });
    }
  };
  
  // Handle path navigation
  const handlePathNavigation = () => {
    if (!pathInput.trim()) return;
    
    const enhancedDiff = bodyDiff as EnhancedDiffResult;
    const result = navigateToPath(enhancedDiff, pathInput);
    
    if (result) {
      setHighlightedLine(result);
      toast({
        title: 'Path found',
        description: `Navigated to ${pathInput}`
      });
    } else {
      toast({
        title: 'Path not found',
        description: `Could not find ${pathInput} in the diff`,
        variant: 'destructive'
      });
    }
  };
  
  // ──────────────────────────────────────────────────────────────────────
  // `i` shortcut — toggle ignore on the currently-focused diff row.
  //
  // Scope: only fires when (a) a diff row received focus (focusedLine is
  // set), AND (b) the active element is one of our row divs (data-focused
  // attribute) — not the cURL textarea or some other input. This is NOT a
  // global shortcut. We use a single document-level listener gated by these
  // conditions to keep the React tree clean.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'i' && e.key !== 'I') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!focusedLine) return;

      // Don't hijack `i` when the user is typing into an input/textarea
      const active = document.activeElement;
      if (active) {
        const tag = active.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (active as HTMLElement).isContentEditable) {
          return;
        }
        // Only fire when the focused element is one of our diff rows
        const id = (active as HTMLElement).id;
        if (!id || !id.startsWith('diff-line-')) return;
      } else {
        return;
      }

      // Find the line on the focused side and read its parsed marker info
      const lines = focusedLine.side === 'left' ? bodyDiff.left : bodyDiff.right;
      const line = lines[focusedLine.line];
      if (!line) return;
      const fieldKey = line.fieldKey ?? null;
      if (!fieldKey) return;

      e.preventDefault();
      // Build the same wildcard-descendant path we use for chip clicks
      const path = `$..${fieldKey}`;
      const existingRule = endpointRules.find((r) => r.path === path);
      if (existingRule) {
        handleForgetByPath(path);
      } else {
        // Pick a classifier name: prefer rule marker (already applied) →
        // auto marker (suggestion) → fallback to a string from the field
        // key (unknown classifier name; will round-trip but won't drive a
        // classifier-based chip).
        const markerType =
          line.noise?.type ||
          (fieldKey.toLowerCase().includes('id') ? 'uuid' : 'trace-id');
        handleTeach(markerType, fieldKey);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [focusedLine, bodyDiff, endpointRules, handleTeach, handleForgetByPath]);

  // Keyboard navigation for search results
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (searchResults.length === 0) return;

      if (e.key === 'n' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const nextIndex = (currentSearchIndex + 1) % searchResults.length;
        setCurrentSearchIndex(nextIndex);
        setHighlightedLine({ 
          line: searchResults[nextIndex].line, 
          side: searchResults[nextIndex].side 
        });
      } else if (e.key === 'p' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const prevIndex = currentSearchIndex === 0 
          ? searchResults.length - 1 
          : currentSearchIndex - 1;
        setCurrentSearchIndex(prevIndex);
        setHighlightedLine({ 
          line: searchResults[prevIndex].line, 
          side: searchResults[prevIndex].side 
        });
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchResults, currentSearchIndex]);

  // Scroll to highlighted line when it changes
  useEffect(() => {
    if (highlightedLine) {
      const element = document.getElementById(`diff-line-${highlightedLine.side}-${highlightedLine.line}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedLine]);

  const isJsonResponse = useMemo(() => {
    try {
      JSON.parse(original.body);
      JSON.parse(localhost.body);
      return true;
    } catch {
      return false;
    }
  }, [original.body, localhost.body]);
  
  // Get structural changes count if available
  const structuralChangesCount = (bodyDiff as EnhancedDiffResult)?.structuralChanges?.length || 0;
  const statistics = (bodyDiff as EnhancedDiffResult)?.statistics;

  return (
    <>
    <Card className="border-0 shadow-lg overflow-hidden">
      <CardHeader className="pb-0 bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/20 shadow-sm">
              <Code2 className="h-5 w-5 text-primary" />
            </div>
            Response Comparison
          </CardTitle>

          {/* Statistics Badge */}
          <div className="flex items-center gap-2">
            {statistics && statistics.percentageChanged > 0 && (
              <Badge variant="outline" className="gap-1">
                <TrendingUp className="h-3 w-3" />
                {statistics.percentageChanged.toFixed(1)}% changed
              </Badge>
            )}
            {structuralChangesCount > 0 && (
              <Badge variant="secondary" className="gap-1">
                <GitBranch className="h-3 w-3" />
                {structuralChangesCount} moves
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs defaultValue="body" className="flex flex-col">
          {/* Toolbar */}
          <div className="px-6 pt-4 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <TabsList className="bg-muted/50 p-1">
                <TabsTrigger value="body" className="gap-2 data-[state=active]:bg-card data-[state=active]:shadow-sm text-sm">
                  Response Body
                  {bodyDiff.hasDifferences && (
                    <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                  )}
                </TabsTrigger>
                <TabsTrigger value="headers" className="gap-2 data-[state=active]:bg-card data-[state=active]:shadow-sm text-sm">
                  Headers
                  {headersDiff.hasDifferences && (
                    <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Diff Options and Search */}
              <DiffOptionsPanel
                options={diffOptions}
                onOptionsChange={setDiffOptions}
                structuralChangesCount={structuralChangesCount}
                contentSize={contentSize}
              />
              {/* Rules viewer — sibling of DiffOptions per CEO/design review */}
              <RulesViewer
                endpoint={original.url || ''}
                rules={endpointRules}
                onRulesChanged={() => {
                  if (endpointKey) setEndpointRules(loadRules(endpointKey));
                  setRulesVersion((v) => v + 1);
                }}
              />
              <DiffSearchBar onSearch={handleSearch} />

              {/* Path Navigation */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <GitBranch className="h-4 w-4" />
                    <span className="hidden sm:inline">Go to Path</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[280px]" align="end">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Navigate to JSON path
                    </p>
                    <div className="flex gap-2">
                      <Input
                        placeholder="$.user.name"
                        value={pathInput}
                        onChange={(e) => setPathInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handlePathNavigation()}
                        className="flex-1"
                      />
                      <Button
                        size="sm"
                        onClick={handlePathNavigation}
                        disabled={!pathInput.trim()}
                      >
                        Go
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex items-center gap-2">
              {isJsonResponse && (
                <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/50">
                  <Button
                    variant={viewMode === 'diff' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('diff')}
                    className="h-7 px-2 gap-1"
                  >
                    <Rows3 className="h-3.5 w-3.5" />
                    <span className="text-xs">Diff</span>
                  </Button>
                  <Button
                    variant={viewMode === 'foldable' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('foldable')}
                    className="h-7 px-2 gap-1"
                  >
                    <FoldVertical className="h-3.5 w-3.5" />
                    <span className="text-xs">Foldable</span>
                  </Button>
                </div>
              )}
              {bodyDiff.hasDifferences && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setShowMergeDialog(true)}
                  className="gap-2"
                >
                  <GitMerge className="h-4 w-4" />
                  <span className="hidden sm:inline">Merge</span>
                </Button>
              )}
            </div>
          </div>
          
          <TabsContent value="body" className="m-0 border-t mt-4">
            {/* Correctness caveats the user must see. A precision warning in
                particular can mean two visibly-different IDs compared equal,
                so it cannot live only in the console. */}
            {(bodyDiff.warnings?.length || bodyDiff.degraded) && (
              <div className="mx-4 mt-4 space-y-2">
                {bodyDiff.warnings?.map((warning) => (
                  <div
                    key={warning}
                    className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
                    <span>{warning}</span>
                  </div>
                ))}
                {bodyDiff.degraded && (
                  <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
                    <span>
                      These responses are too large to align precisely, so lines were matched by
                      position. Differences shown may be wider than the real change.
                    </span>
                  </div>
                )}
              </div>
            )}
            {viewMode === 'diff' ? (
              <div className="grid grid-cols-2 divide-x">
                <DiffPanel
                  title="Original Domain"
                  lines={bodyDiff.left}
                  lineCount={bodyDiff.left.filter((l) => l.type !== 'empty').length}
                  removals={bodyDiff.removals}
                  side="left"
                  content={original.body}
                  icon={Globe}
                  accentColor="primary"
                  isJson={true}
                  highlightedLine={highlightedLine}
                  showOnlyDifferences={diffOptions.showOnlyDifferences}
                  showAnywaySet={showAnywaySet}
                  onToggleShowAnyway={handleToggleShowAnyway}
                  focusedLine={focusedLine}
                  onFocusLine={(idx) => setFocusedLine({ line: idx, side: 'left' })}
                />
                <DiffPanel
                  title="Localhost"
                  lines={bodyDiff.right}
                  lineCount={bodyDiff.right.filter((l) => l.type !== 'empty').length}
                  additions={bodyDiff.additions}
                  side="right"
                  content={localhost.body}
                  icon={Server}
                  accentColor="accent"
                  isJson={true}
                  highlightedLine={highlightedLine}
                  showOnlyDifferences={diffOptions.showOnlyDifferences}
                  onTeach={handleTeach}
                  showAnywaySet={showAnywaySet}
                  onToggleShowAnyway={handleToggleShowAnyway}
                  focusedLine={focusedLine}
                  onFocusLine={(idx) => setFocusedLine({ line: idx, side: 'right' })}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 divide-x">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 p-3 border-b bg-gradient-to-r from-primary/10 to-card">
                    <div className="p-1.5 rounded-lg bg-primary/10">
                      <Globe className="h-4 w-4 text-primary" />
                    </div>
                    <span className="font-semibold text-sm">Original Domain</span>
                  </div>
                  <FoldableJson content={formatJson(original.body)} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 p-3 border-b bg-gradient-to-r from-accent/10 to-card">
                    <div className="p-1.5 rounded-lg bg-accent/10">
                      <Server className="h-4 w-4 text-accent" />
                    </div>
                    <span className="font-semibold text-sm">Localhost</span>
                  </div>
                  <FoldableJson content={formatJson(localhost.body)} />
                </div>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="headers" className="m-0 border-t mt-4">
            <div className="grid grid-cols-2 divide-x">
              <DiffPanel
                title="Original Domain"
                lines={headersDiff.left}
                lineCount={Object.keys(original.headers).length}
                removals={headersDiff.removals}
                side="left"
                content={formatHeaders(original.headers)}
                icon={Globe}
                accentColor="primary"
                highlightedLine={highlightedLine}
                showOnlyDifferences={diffOptions.showOnlyDifferences}
              />
              <DiffPanel
                title="Localhost"
                lines={headersDiff.right}
                lineCount={Object.keys(localhost.headers).length}
                additions={headersDiff.additions}
                side="right"
                content={formatHeaders(localhost.headers)}
                icon={Server}
                accentColor="accent"
                highlightedLine={highlightedLine}
                showOnlyDifferences={diffOptions.showOnlyDifferences}
              />
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>

    {/* Merge Dialog */}
    <Dialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] overflow-hidden p-0">
        <MergeView
          leftLines={bodyDiff.left}
          rightLines={bodyDiff.right}
          leftTitle="Original Domain"
          rightTitle="Localhost"
          onClose={() => setShowMergeDialog(false)}
        />
      </DialogContent>
    </Dialog>
    </>
  );
}
