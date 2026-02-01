import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Minus, Plus, Globe, Server, Code2, Rows3, FoldVertical, GitBranch, TrendingUp, GitMerge } from 'lucide-react';
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
  lineIndex
}: { 
  line: DiffLine; 
  side: 'left' | 'right'; 
  isJson?: boolean;
  isHighlighted?: boolean;
  lineIndex?: number;
}) {
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
        'flex font-mono text-sm transition-all',
        bgClass,
        isHighlighted && 'ring-2 ring-accent ring-offset-1 bg-accent/10'
      )}
      id={`diff-line-${side}-${lineIndex}`}
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
          <InlineSegments segments={line.segments} side={side} />
        ) : isJson && line.type === 'unchanged' ? (
          <JsonSyntaxHighlight content={line.content || ' '} />
        ) : (
          line.content || ' '
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
          
          // Scroll to highlighted line
          if (isHighlighted) {
            setTimeout(() => {
              const element = document.getElementById(`diff-line-${side}-${originalIndex}`);
              element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
          }
          
          return (
            <DiffLineComponent 
              key={idx} 
              line={line} 
              side={side} 
              isJson={isJson}
              isHighlighted={isHighlighted}
              lineIndex={originalIndex}
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
      return computeEnhancedDiff(leftFormatted, rightFormatted, diffOptions) as EnhancedDiffResult;
    } else {
      return computeDiff(leftFormatted, rightFormatted, { advancedMode: diffOptions.advancedMode });
    }
  }, [original.body, localhost.body, diffOptions]);

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
            <div className="p-2 rounded-lg bg-primary/10">
              <Code2 className="h-5 w-5 text-primary" />
            </div>
            Response Comparison
          </CardTitle>
          
          {/* Statistics Badge */}
          {statistics && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <TrendingUp className="h-3 w-3" />
                {statistics.percentageChanged.toFixed(1)}% changed
              </Badge>
              {structuralChangesCount > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <GitBranch className="h-3 w-3" />
                  {structuralChangesCount} moves
                </Badge>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs defaultValue="body" className="flex flex-col">
          <div className="px-6 pt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TabsList className="bg-muted/50 p-1">
                <TabsTrigger value="body" className="gap-2 data-[state=active]:bg-card data-[state=active]:shadow-sm">
                  Response Body
                  {bodyDiff.hasDifferences && (
                    <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                  )}
                </TabsTrigger>
                <TabsTrigger value="headers" className="gap-2 data-[state=active]:bg-card data-[state=active]:shadow-sm">
                  Headers
                  {headersDiff.hasDifferences && (
                    <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                  )}
                </TabsTrigger>
              </TabsList>
              
              {/* Diff Options and Search */}
              <div className="flex items-center gap-2">
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
                          onKeyPress={(e) => e.key === 'Enter' && handlePathNavigation()}
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
