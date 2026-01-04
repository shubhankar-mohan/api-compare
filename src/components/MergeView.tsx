import { useState, useMemo, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { 
  Copy, 
  Check, 
  X, 
  ChevronRight, 
  ChevronLeft, 
  GitMerge,
  FileCode,
  Download,
  Undo,
  CheckCircle2,
  XCircle,
  ArrowLeftRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DiffLine } from '@/lib/diffAlgorithm';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface MergeViewProps {
  leftLines: DiffLine[];
  rightLines: DiffLine[];
  leftTitle?: string;
  rightTitle?: string;
  onClose?: () => void;
}

type MergeChoice = 'left' | 'right' | 'both' | null;

interface MergeDecision {
  lineIndex: number;
  choice: MergeChoice;
  leftContent?: string;
  rightContent?: string;
}

export function MergeView({ 
  leftLines, 
  rightLines, 
  leftTitle = "Original", 
  rightTitle = "Modified",
  onClose 
}: MergeViewProps) {
  const [mergeDecisions, setMergeDecisions] = useState<Map<number, MergeDecision>>(new Map());
  const [showMergedResult, setShowMergedResult] = useState(false);
  const [selectedLine, setSelectedLine] = useState<number | null>(null);

  // Calculate conflicts (lines that are different)
  const conflicts = useMemo(() => {
    const conflictIndices: number[] = [];
    const maxLength = Math.max(leftLines.length, rightLines.length);
    
    for (let i = 0; i < maxLength; i++) {
      const leftLine = leftLines[i];
      const rightLine = rightLines[i];
      
      // A line is a conflict if:
      // - One side has content and the other doesn't (added/removed)
      // - Both sides exist but are different (modified)
      // - Not both unchanged
      const isConflict = 
        (leftLine?.type === 'modified' || rightLine?.type === 'modified') ||
        (leftLine?.type === 'added' || rightLine?.type === 'added') ||
        (leftLine?.type === 'removed' || rightLine?.type === 'removed') ||
        (leftLine?.type === 'empty' && rightLine?.type !== 'empty') ||
        (leftLine?.type !== 'empty' && rightLine?.type === 'empty');
      
      if (isConflict) {
        conflictIndices.push(i);
      }
    }
    return conflictIndices;
  }, [leftLines, rightLines]);

  // Handle merge decision for a line
  const handleMergeDecision = useCallback((lineIndex: number, choice: MergeChoice) => {
    const leftLine = leftLines[lineIndex];
    const rightLine = rightLines[lineIndex];
    
    setMergeDecisions(prev => {
      const newDecisions = new Map(prev);
      newDecisions.set(lineIndex, {
        lineIndex,
        choice,
        leftContent: leftLine?.content,
        rightContent: rightLine?.content
      });
      return newDecisions;
    });
  }, [leftLines, rightLines]);

  // Generate merged result
  const mergedResult = useMemo(() => {
    const result: string[] = [];
    
    for (let i = 0; i < Math.max(leftLines.length, rightLines.length); i++) {
      const decision = mergeDecisions.get(i);
      const leftLine = leftLines[i];
      const rightLine = rightLines[i];
      
      if (decision) {
        if (decision.choice === 'left' && leftLine?.content) {
          result.push(leftLine.content);
        } else if (decision.choice === 'right' && rightLine?.content) {
          result.push(rightLine.content);
        } else if (decision.choice === 'both') {
          if (leftLine?.content) result.push(leftLine.content);
          if (rightLine?.content && rightLine.content !== leftLine?.content) {
            result.push(rightLine.content);
          }
        }
      } else {
        // No decision made - use unchanged lines or default to left
        if (leftLine?.type === 'unchanged' && leftLine.content) {
          result.push(leftLine.content);
        } else if (rightLine?.type === 'unchanged' && rightLine.content) {
          result.push(rightLine.content);
        } else if (leftLine?.content && leftLine.type !== 'empty') {
          result.push(leftLine.content);
        } else if (rightLine?.content && rightLine.type !== 'empty') {
          result.push(rightLine.content);
        }
      }
    }
    
    return result.join('\n');
  }, [leftLines, rightLines, mergeDecisions]);

  // Copy merged result
  const copyMergedResult = () => {
    navigator.clipboard.writeText(mergedResult);
    toast({
      title: 'Copied!',
      description: 'Merged result copied to clipboard',
    });
  };

  // Download merged result
  const downloadMergedResult = () => {
    const blob = new Blob([mergedResult], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'merged-result.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Auto-resolve all conflicts
  const autoResolve = (preference: 'left' | 'right') => {
    const newDecisions = new Map<number, MergeDecision>();
    conflicts.forEach(index => {
      const leftLine = leftLines[index];
      const rightLine = rightLines[index];
      newDecisions.set(index, {
        lineIndex: index,
        choice: preference,
        leftContent: leftLine?.content,
        rightContent: rightLine?.content
      });
    });
    setMergeDecisions(newDecisions);
    toast({
      title: 'Auto-resolved',
      description: `All conflicts resolved using ${preference} version`,
    });
  };

  const resolvedCount = conflicts.filter(i => mergeDecisions.has(i)).length;
  const allResolved = resolvedCount === conflicts.length;

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if a conflict line is selected
      if (selectedLine === null || !conflicts.includes(selectedLine)) return;

      // Prevent default for our shortcuts
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) {
        e.preventDefault();
      }

      switch(e.key) {
        case 'ArrowLeft':
          handleMergeDecision(selectedLine, 'left');
          break;
        case 'ArrowRight':
          handleMergeDecision(selectedLine, 'right');
          break;
        case 'Enter':
        case ' ':
          handleMergeDecision(selectedLine, 'both');
          break;
        case 'ArrowUp': {
          const currentIndex = conflicts.indexOf(selectedLine);
          if (currentIndex > 0) {
            setSelectedLine(conflicts[currentIndex - 1]);
          }
          break;
        }
        case 'ArrowDown': {
          const currentIndex = conflicts.indexOf(selectedLine);
          if (currentIndex < conflicts.length - 1) {
            setSelectedLine(conflicts[currentIndex + 1]);
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLine, conflicts, handleMergeDecision]);

  return (
    <TooltipProvider>
      <Card className="border-0 shadow-lg">
        <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-accent/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <GitMerge className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Merge Conflicts Resolution</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Choose which version to keep for each difference
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  <kbd className="px-1 py-0.5 text-xs font-semibold bg-muted rounded">←</kbd> Accept Left
                  {" · "}
                  <kbd className="px-1 py-0.5 text-xs font-semibold bg-muted rounded">→</kbd> Accept Right
                  {" · "}
                  <kbd className="px-1 py-0.5 text-xs font-semibold bg-muted rounded">Enter</kbd> Accept Both
                  {" · "}
                  <kbd className="px-1 py-0.5 text-xs font-semibold bg-muted rounded">↑↓</kbd> Navigate
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={allResolved ? "success" : "secondary"} className="gap-1">
                {allResolved ? <CheckCircle2 className="h-3 w-3" /> : null}
                {resolvedCount} / {conflicts.length} resolved
              </Badge>
              <div className="flex gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => autoResolve('left')}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      All Left
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Accept all from {leftTitle}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => autoResolve('right')}
                    >
                      All Right
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Accept all from {rightTitle}</TooltipContent>
                </Tooltip>
              </div>
              {onClose && (
                <Button variant="ghost" size="sm" onClick={onClose}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="border-t">
            {/* Conflict Resolution Area */}
            <div className="max-h-[500px] overflow-y-auto">
              {leftLines.map((leftLine, index) => {
                const rightLine = rightLines[index];
                // A line is a conflict if it's not unchanged, or if it's modified, added, removed, or empty
                const isConflict = (leftLine.type !== 'unchanged' || rightLine?.type !== 'unchanged') && 
                                 (leftLine.type !== 'empty' || rightLine?.type !== 'empty');
                const decision = mergeDecisions.get(index);
                
                if (!isConflict) {
                  // Unchanged line - show simple
                  return (
                    <div key={index} className="flex items-center border-b border-border/50">
                      <div className="w-12 text-center text-xs text-muted-foreground py-1">
                        {leftLine.lineNumber || rightLine?.lineNumber}
                      </div>
                      <div className="flex-1 px-3 py-1 font-mono text-sm text-muted-foreground">
                        {leftLine.content || rightLine?.content}
                      </div>
                    </div>
                  );
                }

                // Conflict line - show merge options
                const isSelected = selectedLine === index;
                return (
                  <div 
                    key={index} 
                    className={cn(
                      "border-b border-border cursor-pointer transition-all",
                      isSelected && "ring-2 ring-primary ring-inset"
                    )}
                    onClick={() => setSelectedLine(index)}
                  >
                    <div className="flex items-stretch">
                      {/* Left side */}
                      <div className={cn(
                        "flex-1 flex items-center",
                        decision?.choice === 'left' && "bg-green-50 dark:bg-green-900/20",
                        leftLine.type === 'empty' && "opacity-50"
                      )}>
                        <div className="w-12 text-center text-xs text-muted-foreground py-2">
                          {leftLine.lineNumber}
                        </div>
                        <div className={cn(
                          "flex-1 px-3 py-2 font-mono text-sm",
                          leftLine.type === 'removed' && "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20",
                          leftLine.type === 'modified' && "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20"
                        )}>
                          {leftLine.content || <span className="text-muted-foreground italic">（empty）</span>}
                        </div>
                      </div>

                      {/* Merge controls */}
                      <div className="flex flex-col items-center justify-center gap-1 px-3 py-2 bg-gradient-to-r from-muted/50 via-muted to-muted/50 border-x-2 border-primary/20">
                        <div className="flex items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant={decision?.choice === 'left' ? 'default' : 'outline'}
                                className={cn(
                                  "h-8 w-8 p-0 transition-all",
                                  decision?.choice === 'left' && "bg-green-600 hover:bg-green-700"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMergeDecision(index, 'left');
                                }}
                                disabled={leftLine.type === 'empty'}
                              >
                                <ChevronLeft className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Accept left version</TooltipContent>
                          </Tooltip>
                          
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant={decision?.choice === 'both' ? 'default' : 'outline'}
                                className={cn(
                                  "h-8 w-8 p-0 transition-all",
                                  decision?.choice === 'both' && "bg-blue-600 hover:bg-blue-700"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMergeDecision(index, 'both');
                                }}
                                disabled={leftLine.type === 'empty' && rightLine?.type === 'empty'}
                              >
                                <ArrowLeftRight className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Accept both versions</TooltipContent>
                          </Tooltip>
                          
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant={decision?.choice === 'right' ? 'default' : 'outline'}
                                className={cn(
                                  "h-8 w-8 p-0 transition-all",
                                  decision?.choice === 'right' && "bg-green-600 hover:bg-green-700"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMergeDecision(index, 'right');
                                }}
                                disabled={rightLine?.type === 'empty'}
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Accept right version</TooltipContent>
                          </Tooltip>
                        </div>
                        {decision && (
                          <span className="text-[10px] font-medium text-muted-foreground">
                            {decision.choice === 'left' ? '← Left' : 
                             decision.choice === 'right' ? 'Right →' : 
                             decision.choice === 'both' ? '↔ Both' : ''}
                          </span>
                        )}
                      </div>

                      {/* Right side */}
                      <div className={cn(
                        "flex-1 flex items-center",
                        decision?.choice === 'right' && "bg-green-50 dark:bg-green-900/20",
                        rightLine?.type === 'empty' && "opacity-50"
                      )}>
                        <div className={cn(
                          "flex-1 px-3 py-2 font-mono text-sm",
                          rightLine?.type === 'added' && "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20",
                          rightLine?.type === 'modified' && "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20"
                        )}>
                          {rightLine?.content || <span className="text-muted-foreground italic">（empty）</span>}
                        </div>
                        <div className="w-12 text-center text-xs text-muted-foreground py-2">
                          {rightLine?.lineNumber}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Merged Result Actions */}
            <div className="p-4 border-t bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    variant={showMergedResult ? "default" : "secondary"}
                    size="sm"
                    onClick={() => setShowMergedResult(!showMergedResult)}
                    className="gap-2"
                  >
                    <FileCode className="h-4 w-4" />
                    {showMergedResult ? "Hide" : "Show"} Merged Result
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyMergedResult}
                    disabled={!allResolved}
                    className="gap-2"
                  >
                    <Copy className="h-4 w-4" />
                    Copy Result
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={downloadMergedResult}
                    disabled={!allResolved}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </Button>
                </div>
              </div>

              {/* Merged Result Preview */}
              {showMergedResult && (
                <div className="mt-4 rounded-lg border bg-card">
                  <div className="p-3 border-b bg-muted/50">
                    <h3 className="text-sm font-medium">Merged Result Preview</h3>
                  </div>
                  <div className="p-3 max-h-[300px] overflow-y-auto">
                    <pre className="font-mono text-sm whitespace-pre-wrap">{mergedResult}</pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}