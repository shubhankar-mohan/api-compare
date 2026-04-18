import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Minus, Plus, Globe, Server, Code2, Rows3, FoldVertical, GitBranch, TrendingUp, GitMerge, Sparkles, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { ApiResponse } from '@/lib/requestExecutor';
import { computeDiff, formatJson, formatHeaders, DiffLine, DiffSegment } from '@/lib/diffAlgorithm';
import {
  computeEnhancedDiff,
  DiffOptions,
  EnhancedDiffResult,
  searchInDiff,
  navigateToPath
} from '@/lib/enhancedDiffAlgorithm';
import {
  loadRules,
  addRule,
  canonicalizeEndpoint,
  type NoiseRule,
  type NoiseClassifier,
} from '@/lib/noiseRules';
import { cn } from '@/lib/utils';
import { JsonSyntaxHighlight } from './JsonSyntaxHighlight';
import { FoldableJson } from './FoldableJson';
import { DiffOptionsPanel, DiffSearchBar } from './DiffOptions';
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
// Noise marker parsing
//
// preprocessJsonForComparison appends inline `/* NOISE:<type>:<source> */`
// markers to lines that match a classifier or saved rule. The renderer
// strips these markers before display and uses them to drive chip UI.

interface NoiseMarker {
  type: NoiseClassifier;
  source: 'auto' | 'rule';
}

interface ParsedLine {
  /** Line content with NOISE markers stripped (legacy TIMESTAMP/ID markers preserved). */
  content: string;
  markers: NoiseMarker[];
  /** JSON path of the field on this line, parsed from `"key":` prefix. */
  fieldKey: string | null;
}

const NOISE_MARKER_RE = /\s*\/\*\s*NOISE:([a-z0-9-]+):(auto|rule)\s*\*\//g;

function parseNoiseMarkers(content: string): ParsedLine {
  const markers: NoiseMarker[] = [];
  let m: RegExpExecArray | null;
  // Reset regex state (uses g flag)
  NOISE_MARKER_RE.lastIndex = 0;
  while ((m = NOISE_MARKER_RE.exec(content)) !== null) {
    markers.push({
      type: m[1] as NoiseClassifier,
      source: m[2] as 'auto' | 'rule',
    });
  }
  const stripped = content.replace(NOISE_MARKER_RE, '');
  const keyMatch = stripped.match(/^\s*"([^"]+)"\s*:/);
  return {
    content: stripped,
    markers,
    fieldKey: keyMatch ? keyMatch[1] : null,
  };
}

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
  const parsed = useMemo(() => parseNoiseMarkers(line.content || ''), [line.content]);
  const autoMarker = parsed.markers.find((m) => m.source === 'auto');
  const ruleMarker = parsed.markers.find((m) => m.source === 'rule');
  // A line is "noise-applied" when a rule marker is present AND the user
  // hasn't toggled show-anyway. Such lines render greyed.
  const noiseApplied = !!ruleMarker && !isShowAnyway;

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
            segments={line.segments.map((s) => ({ ...s, text: s.text.replace(NOISE_MARKER_RE, '') }))}
            side={side}
          />
        ) : isJson && line.type === 'unchanged' ? (
          <JsonSyntaxHighlight content={parsed.content || ' '} />
        ) : (
          parsed.content || ' '
        )}
        {/* Auto chip — only render on the right side to avoid duplication */}
        {autoMarker && side === 'right' && onTeach && (
          <Badge
            variant="outline"
            className="ml-2 cursor-pointer gap-1 px-2 py-0 text-[10px] font-normal border-primary/40 text-primary hover:bg-primary/10 align-middle"
            onClick={() => onTeach(autoMarker.type, parsed.fieldKey)}
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

    if (hasOptions || diffOptions.advancedMode !== false) {
      return computeEnhancedDiff(leftFormatted, rightFormatted, diffOptions, endpointRules) as EnhancedDiffResult;
    } else {
      return computeDiff(leftFormatted, rightFormatted, { advancedMode: diffOptions.advancedMode, rules: endpointRules });
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
      // Build the rule path: prefer wildcard descendant match so the rule
      // applies regardless of nesting depth (a UUID under `$.data.user.id`
      // and one under `$.id` should both be ignored after one click).
      const path = fieldKey ? `$..${fieldKey}` : `$..*`;
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

  const headersDiff = useMemo(() => {
    const leftHeaders = formatHeaders(original.headers);
    const rightHeaders = formatHeaders(localhost.headers);
    return computeDiff(leftHeaders, rightHeaders, { advancedMode: diffOptions.advancedMode });
  }, [original.headers, localhost.headers, diffOptions.advancedMode]);
  
  // Handle search
  const handleSearch = (query: string, options: { caseSensitive?: boolean; regex?: boolean }) => {
    const enhancedDiff = bodyDiff as EnhancedDiffResult;
    const results = searchInDiff(enhancedDiff, query, options);
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
            {viewMode === 'diff' ? (
              <div className="grid grid-cols-2 divide-x">
                <DiffPanel
                  title="Original Domain"
                  lines={bodyDiff.left}
                  lineCount={original.body.split('\n').length}
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
                  lineCount={localhost.body.split('\n').length}
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
