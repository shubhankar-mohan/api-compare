import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  ArrowRightLeft, FileText, Copy, Trash2, Minus, Plus, Globe, Server,
  Wand2, CaseLower, SortAsc, WrapText, Scissors, RotateCcw, Settings,
  ChevronLeft, ChevronRight, GitMerge, Upload, Download, Search, Replace
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { computeDiff, formatJson, DiffLine, DiffSegment, ComparisonConfig } from '@/lib/diffAlgorithm';
import { computeStructuralDiff } from '@/lib/structuralDiff';
import { cn } from '@/lib/utils';
import { JsonSyntaxHighlight } from './JsonSyntaxHighlight';
import { MergeView } from './MergeView';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

function InlineSegments({ segments, side }: { segments: DiffSegment[]; side: 'left' | 'right' }) {
  return (
    <>
      {segments.map((seg, idx) => {
        if (seg.type === 'unchanged') {
          return <span key={idx}>{seg.text}</span>;
        }
        // On left side, show removed; on right side, show added
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
  isJson, 
  side, 
  onAcceptChange,
  onRejectChange,
  showMergeControls,
  lineIndex
}: { 
  line: DiffLine; 
  isJson?: boolean; 
  side: 'left' | 'right';
  onAcceptChange?: (lineIndex: number, side: 'left' | 'right') => void;
  onRejectChange?: (lineIndex: number, side: 'left' | 'right') => void;
  showMergeControls?: boolean;
  lineIndex?: number;
}) {
  const bgClass = {
    added: 'bg-[hsl(var(--diff-added-bg))]',
    removed: 'bg-[hsl(var(--diff-removed-bg))]',
    modified: 'bg-yellow-100 dark:bg-yellow-900/20',  // More visible yellow background for modified lines
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

  const showIcon = line.type === 'added' || line.type === 'removed' || line.type === 'modified';
  const canMerge = showMergeControls && (line.type === 'added' || line.type === 'removed' || line.type === 'modified');

  return (
    <div className={cn('flex font-mono text-sm min-w-fit relative group', bgClass)}>
      <div className="w-12 flex-shrink-0 px-2 py-0.5 text-right text-[hsl(var(--diff-line-number))] bg-[hsl(var(--diff-line-number-bg))] select-none border-r border-border sticky left-0 z-10">
        {line.lineNumber ?? ''}
      </div>
      {canMerge && lineIndex !== undefined && (
        <div className="absolute -left-24 top-0 h-full flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 hover:bg-green-500/20"
            onClick={() => onAcceptChange?.(lineIndex, side)}
            title="Accept this change"
          >
            <ChevronLeft className="h-4 w-4 text-green-600" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 hover:bg-red-500/20"
            onClick={() => onRejectChange?.(lineIndex, side)}
            title="Reject this change"
          >
            <ChevronRight className="h-4 w-4 text-red-600" />
          </Button>
        </div>
      )}
      <div className="w-6 flex-shrink-0 flex items-center justify-center text-xs sticky left-12 bg-inherit z-10">
        {(line.type === 'added' || (line.type === 'modified' && side === 'right')) && (
          <Plus className="h-3 w-3 text-[hsl(var(--diff-added))]" />
        )}
        {(line.type === 'removed' || (line.type === 'modified' && side === 'left')) && (
          <Minus className="h-3 w-3 text-[hsl(var(--diff-removed))]" />
        )}
      </div>
      <pre className={cn('px-2 py-0.5 whitespace-pre', textClass)}>
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
  onAcceptChange,
  onRejectChange,
  showMergeControls,
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
  onAcceptChange?: (lineIndex: number, side: 'left' | 'right') => void;
  onRejectChange?: (lineIndex: number, side: 'left' | 'right') => void;
  showMergeControls?: boolean;
}) {
  const copyToClipboard = () => {
    navigator.clipboard.writeText(content);
    toast({
      title: 'Copied!',
      description: 'Content copied to clipboard',
    });
  };

  const lineText = lineCount === 1 ? '1 line' : `${lineCount} lines`;

  return (
    <div className="flex flex-col min-w-0 overflow-hidden">
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
              {removals} removal{removals > 1 ? 's' : ''}
            </Badge>
          )}
          {side === 'right' && additions !== undefined && additions > 0 && (
            <Badge variant="success" className="gap-1 text-xs">
              <Plus className="h-3 w-3" />
              {additions} addition{additions > 1 ? 's' : ''}
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
      <div className="min-w-0 overflow-x-auto overflow-y-hidden">
        {lines.map((line, idx) => (
          <DiffLineComponent 
            key={idx} 
            line={line} 
            isJson={isJson} 
            side={side}
            onAcceptChange={onAcceptChange}
            onRejectChange={onRejectChange}
            showMergeControls={showMergeControls}
            lineIndex={idx}
          />
        ))}
      </div>
    </div>
  );
}

interface ToolButtonProps {
  icon: typeof CaseLower;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

function ToolButton({ icon: Icon, label, onClick, disabled }: ToolButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 w-full px-2 py-1.5 text-xs text-left rounded-lg transition-colors",
        "hover:bg-muted text-foreground",
        disabled && "opacity-50 cursor-not-allowed"
      )}
      title={label}
    >
      <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function TextDiffChecker() {
  const [leftText, setLeftText] = useState('');
  const [rightText, setRightText] = useState('');
  const [leftFileName, setLeftFileName] = useState<string>('');
  const [rightFileName, setRightFileName] = useState<string>('');
  const [hasCompared, setHasCompared] = useState(false);
  const [realTimeDiff, setRealTimeDiff] = useState(false);
  const [showMobileTools, setShowMobileTools] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);
  const [mergedText, setMergedText] = useState('');
  const [acceptedChanges, setAcceptedChanges] = useState<Set<string>>(new Set());
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [showFindReplaceDialog, setShowFindReplaceDialog] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [replaceTarget, setReplaceTarget] = useState<'left' | 'right' | 'both'>('both');

  const isJson = useMemo(() => {
    try {
      if (!leftText.trim() && !rightText.trim()) return false;
      if (leftText.trim()) JSON.parse(leftText);
      if (rightText.trim()) JSON.parse(rightText);
      return true;
    } catch {
      return false;
    }
  }, [leftText, rightText]);

  const shouldShowDiff = realTimeDiff || hasCompared;

  const diff = useMemo(() => {
    if (!shouldShowDiff) return null;
    const left = isJson ? formatJson(leftText) : leftText;
    const right = isJson ? formatJson(rightText) : rightText;
    
    // Detect file type and apply appropriate config
    let formatType: 'json' | 'yaml' | 'text' = 'text';
    if (isJson) {
      formatType = 'json';
    } else if (leftFileName?.endsWith('.yml') || leftFileName?.endsWith('.yaml') || 
               rightFileName?.endsWith('.yml') || rightFileName?.endsWith('.yaml') ||
               leftText.includes('services:') || leftText.includes('version:')) {
      formatType = 'yaml';
    }
    
    const config: ComparisonConfig = {
      ignoreTrailingWhitespace: true,
      ignoreLineEndings: true,
      ignoreInvisibleCharacters: true,
      normalizeIndentation: formatType === 'yaml',
      tabSize: 2,
      formatType: formatType as any
    };
    
    // Use structural diff for YAML files to handle missing fields better
    if (formatType === 'yaml') {
      return computeStructuralDiff(left, right, config);
    }
    
    return computeDiff(left, right, { advancedMode: true, config });
  }, [leftText, rightText, shouldShowDiff, isJson, leftFileName, rightFileName]);

  const handleCompare = () => {
    if (!leftText.trim() && !rightText.trim()) {
      toast({ title: 'Empty input', description: 'Please enter text to compare', variant: 'destructive' });
      return;
    }
    setHasCompared(true);
    
    // Calculate the difference count based on the current diff
    const left = isJson ? formatJson(leftText) : leftText;
    const right = isJson ? formatJson(rightText) : rightText;
    
    // Use same config as display diff
    let formatType: 'json' | 'yaml' | 'text' = 'text';
    if (isJson) {
      formatType = 'json';
    } else if (leftFileName?.endsWith('.yml') || leftFileName?.endsWith('.yaml') || 
               rightFileName?.endsWith('.yml') || rightFileName?.endsWith('.yaml') ||
               leftText.includes('services:') || leftText.includes('version:')) {
      formatType = 'yaml';
    }
    
    const config: ComparisonConfig = {
      ignoreTrailingWhitespace: true,
      ignoreLineEndings: true,
      ignoreInvisibleCharacters: true,
      normalizeIndentation: formatType === 'yaml',
      tabSize: 2,
      formatType: formatType as any
    };
    
    // Use structural diff for YAML files to handle missing fields better
    const currentDiff = formatType === 'yaml' 
      ? computeStructuralDiff(left, right, config)
      : computeDiff(left, right, { advancedMode: true, config });
    const diffCount = currentDiff.additions + currentDiff.removals;
    
    toast({ 
      title: 'Comparison complete', 
      description: currentDiff.hasDifferences 
        ? `${diffCount} difference${diffCount === 1 ? '' : 's'} found` 
        : 'Texts are identical'
    });
  };

  const handleClear = () => {
    setLeftText('');
    setRightText('');
    setLeftFileName('');
    setRightFileName('');
    setHasCompared(false);
    setMergeMode(false);
    setMergedText('');
    setAcceptedChanges(new Set());
  };

  const handleFormatJson = (side: 'left' | 'right') => {
    try {
      const text = side === 'left' ? leftText : rightText;
      const formatted = formatJson(text);
      if (side === 'left') setLeftText(formatted);
      else setRightText(formatted);
      toast({ title: 'Formatted!', description: 'JSON has been beautified' });
    } catch {
      toast({ title: 'Invalid JSON', description: 'Could not parse as JSON', variant: 'destructive' });
    }
  };

  const applyTool = (tool: string) => {
    const transform = (text: string): string => {
      switch (tool) {
        case 'lowercase':
          return text.toLowerCase();
        case 'sort':
          return text.split('\n').sort().join('\n');
        case 'replace-breaks':
          return text.replace(/\n/g, ' ');
        case 'trim':
          return text.split('\n').map(line => line.trim()).join('\n');
        default:
          return text;
      }
    };
    
    if (leftText.trim()) setLeftText(transform(leftText));
    if (rightText.trim()) setRightText(transform(rightText));
    setHasCompared(false);
    toast({ title: 'Applied!', description: 'Transformation applied to both texts' });
  };

  const canFormat = (text: string) => {
    try {
      JSON.parse(text);
      return true;
    } catch {
      return false;
    }
  };

  const handleAcceptChange = (lineIndex: number, side: 'left' | 'right') => {
    if (!diff) return;
    
    const changeKey = `${lineIndex}-${side}`;
    const newAccepted = new Set(acceptedChanges);
    newAccepted.add(changeKey);
    setAcceptedChanges(newAccepted);
    
    // Apply the change to merged text
    applyMergedChanges(newAccepted);
  };

  const handleRejectChange = (lineIndex: number, side: 'left' | 'right') => {
    if (!diff) return;
    
    const changeKey = `${lineIndex}-${side}`;
    const newAccepted = new Set(acceptedChanges);
    newAccepted.delete(changeKey);
    setAcceptedChanges(newAccepted);
    
    // Apply the change to merged text
    applyMergedChanges(newAccepted);
  };

  const applyMergedChanges = (accepted: Set<string>) => {
    if (!diff) return;
    
    const mergedLines: string[] = [];
    
    for (let i = 0; i < diff.left.length; i++) {
      const leftLine = diff.left[i];
      const rightLine = diff.right[i];
      const leftAccepted = accepted.has(`${i}-left`);
      const rightAccepted = accepted.has(`${i}-right`);
      
      if (leftLine.type === 'unchanged') {
        mergedLines.push(leftLine.content);
      } else if (leftLine.type === 'removed' && !rightAccepted) {
        mergedLines.push(leftLine.content);
      } else if (rightLine.type === 'added' && rightAccepted) {
        mergedLines.push(rightLine.content);
      } else if (leftLine.type === 'modified') {
        if (rightAccepted) {
          mergedLines.push(rightLine.content);
        } else {
          mergedLines.push(leftLine.content);
        }
      }
    }
    
    setMergedText(mergedLines.filter(line => line !== '').join('\n'));
  };

  const handleStartMerge = () => {
    setMergeMode(true);
    setMergedText(leftText);
    toast({
      title: 'Merge Mode',
      description: 'Click the arrows to accept or reject changes',
    });
  };

  const handleFinishMerge = () => {
    navigator.clipboard.writeText(mergedText);
    toast({
      title: 'Merged Result Copied!',
      description: 'The merged text has been copied to your clipboard',
    });
  };

  const handleFileUpload = (side: 'left' | 'right') => (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (side === 'left') {
        setLeftText(content);
        setLeftFileName(file.name);
      } else {
        setRightText(content);
        setRightFileName(file.name);
      }
      if (!realTimeDiff) setHasCompared(false);
      toast({
        title: 'File loaded!',
        description: `${file.name} has been loaded successfully`,
      });
    };
    reader.onerror = () => {
      toast({
        title: 'Error loading file',
        description: 'Failed to read the selected file',
        variant: 'destructive'
      });
    };
    reader.readAsText(file);
  };

  const handleSaveResults = () => {
    if (!diff) return;

    const results = {
      comparison: {
        hasDifferences: diff.hasDifferences,
        additions: diff.additions,
        removals: diff.removals,
        leftFile: leftFileName || 'Text A',
        rightFile: rightFileName || 'Text B',
        timestamp: new Date().toISOString()
      },
      leftContent: leftText,
      rightContent: rightText,
      ...(mergeMode && mergedText && { mergedContent: mergedText })
    };

    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diff-comparison-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: 'Results saved!',
      description: 'Comparison results have been downloaded as a JSON file',
    });
  };

  // Helper function to convert escape sequences to actual characters
  const unescapeString = (str: string): string => {
    return str
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\b/g, '\b')
      .replace(/\\f/g, '\f')
      .replace(/\\v/g, '\v')
      .replace(/\\0/g, '\0')
      .replace(/\\\\/g, '\\'); // Handle escaped backslashes
  };

  const handleFindReplace = () => {
    if (!findText) {
      toast({
        title: 'Find text required',
        description: 'Please enter text to find',
        variant: 'destructive'
      });
      return;
    }

    // Convert escape sequences to actual characters
    const findPattern = unescapeString(findText);
    const replaceWith = unescapeString(replaceText);

    let replacements = 0;

    if (replaceTarget === 'left' || replaceTarget === 'both') {
      if (leftText.includes(findPattern)) {
        const newText = leftText.replaceAll(findPattern, replaceWith);
        setLeftText(newText);
        // Count occurrences of the actual pattern
        const escapedPattern = findPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        replacements += (leftText.match(new RegExp(escapedPattern, 'g')) || []).length;
      }
    }

    if (replaceTarget === 'right' || replaceTarget === 'both') {
      if (rightText.includes(findPattern)) {
        const newText = rightText.replaceAll(findPattern, replaceWith);
        setRightText(newText);
        // Count occurrences of the actual pattern
        const escapedPattern = findPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        replacements += (rightText.match(new RegExp(escapedPattern, 'g')) || []).length;
      }
    }

    if (!realTimeDiff) setHasCompared(false);

    // Reset dialog state
    setFindText('');
    setReplaceText('');
    setShowFindReplaceDialog(false);

    if (replacements > 0) {
      toast({
        title: 'Find & Replace completed!',
        description: `Replaced ${replacements} occurrence${replacements === 1 ? '' : 's'}`,
      });
    } else {
      toast({
        title: 'No matches found',
        description: 'The find text was not found in the selected content',
        variant: 'destructive'
      });
    }
  };

  return (
    <>
    <div className="flex gap-3 relative">
      {/* Left Sidebar - Tools for Desktop */}
      <div className="w-36 flex-shrink-0 hidden lg:block">
        <Card className="sticky top-24 border-0 shadow-md">
          <CardContent className="p-3 space-y-3">
            {/* Toggles */}
            <div className="space-y-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="realtime" className="text-xs font-medium">Real-time diff</Label>
                <Switch 
                  id="realtime" 
                  checked={realTimeDiff} 
                  onCheckedChange={setRealTimeDiff}
                  className="ml-0"
                />
              </div>
            </div>

            {/* Tools Section */}
            <div className="pt-2 border-t">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Tools</p>
              <div className="space-y-0.5">
                <ToolButton
                  icon={CaseLower}
                  label="To lowercase"
                  onClick={() => applyTool('lowercase')}
                  disabled={!leftText.trim() && !rightText.trim()}
                />
                <ToolButton
                  icon={SortAsc}
                  label="Sort lines"
                  onClick={() => applyTool('sort')}
                  disabled={!leftText.trim() && !rightText.trim()}
                />
                <ToolButton
                  icon={WrapText}
                  label="Replace line breaks"
                  onClick={() => applyTool('replace-breaks')}
                  disabled={!leftText.trim() && !rightText.trim()}
                />
                <ToolButton
                  icon={Scissors}
                  label="Trim whitespace"
                  onClick={() => applyTool('trim')}
                  disabled={!leftText.trim() && !rightText.trim()}
                />
                <ToolButton
                  icon={Replace}
                  label="Find & Replace"
                  onClick={() => setShowFindReplaceDialog(true)}
                  disabled={!leftText.trim() && !rightText.trim()}
                />
              </div>
            </div>

            {/* Clear */}
            <div className="pt-2 border-t">
              <ToolButton
                icon={RotateCcw}
                label="Clear all"
                onClick={handleClear}
                disabled={!leftText.trim() && !rightText.trim()}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="flex-1 space-y-6 min-w-0 overflow-hidden">
        {/* Mobile Tools Button */}
        <div className="lg:hidden fixed bottom-6 right-6 z-50">
          <Button
            onClick={() => setShowMobileTools(!showMobileTools)}
            className="rounded-full h-12 w-12 shadow-lg"
            size="icon"
          >
            <Settings className="h-5 w-5" />
          </Button>
          
          {/* Mobile Tools Dropdown */}
          {showMobileTools && (
            <Card className="absolute bottom-14 right-0 w-48 shadow-xl">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs font-medium">Real-time diff</Label>
                  <Switch 
                    checked={realTimeDiff} 
                    onCheckedChange={setRealTimeDiff}
                    className="scale-90"
                  />
                </div>
                <Separator className="my-2" />
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">Tools</p>
                <div className="space-y-0.5">
                  <ToolButton
                    icon={CaseLower}
                    label="To lowercase"
                    onClick={() => { applyTool('lowercase'); setShowMobileTools(false); }}
                    disabled={!leftText.trim() && !rightText.trim()}
                  />
                  <ToolButton
                    icon={SortAsc}
                    label="Sort lines"
                    onClick={() => { applyTool('sort'); setShowMobileTools(false); }}
                    disabled={!leftText.trim() && !rightText.trim()}
                  />
                  <ToolButton
                    icon={WrapText}
                    label="Replace breaks"
                    onClick={() => { applyTool('replace-breaks'); setShowMobileTools(false); }}
                    disabled={!leftText.trim() && !rightText.trim()}
                  />
                  <ToolButton
                    icon={Scissors}
                    label="Trim whitespace"
                    onClick={() => { applyTool('trim'); setShowMobileTools(false); }}
                    disabled={!leftText.trim() && !rightText.trim()}
                  />
                  <ToolButton
                    icon={Replace}
                    label="Find & Replace"
                    onClick={() => { setShowFindReplaceDialog(true); setShowMobileTools(false); }}
                    disabled={!leftText.trim() && !rightText.trim()}
                  />
                  <ToolButton
                    icon={RotateCcw}
                    label="Clear all"
                    onClick={() => { handleClear(); setShowMobileTools(false); }}
                    disabled={!leftText.trim() && !rightText.trim()}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Input Section */}
        <Card className="overflow-hidden border-0 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-accent/10 via-primary/10 to-accent/10 pb-6">
            <CardTitle className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-accent/20 shadow-sm">
                <FileText className="h-5 w-5 text-accent" />
              </div>
              <span>Text Diff</span>
            </CardTitle>
            <CardDescription className="text-base">
              Compare two texts or JSON objects side by side
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-semibold">Text A</Label>
                    {leftFileName && (
                      <Badge variant="outline" className="text-xs">
                        <FileText className="h-3 w-3 mr-1" />
                        {leftFileName}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleFormatJson('left')}
                      disabled={!canFormat(leftText)}
                      className="h-7 px-2 text-muted-foreground hover:text-accent gap-1"
                      title="Format JSON"
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                      <span className="text-xs">Format</span>
                    </Button>
                    <div className="relative">
                      <input
                        type="file"
                        accept=".txt,.json,.js,.ts,.html,.css,.md,.xml,.csv,.log"
                        onChange={handleFileUpload('left')}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        title="Upload file"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-muted-foreground hover:text-primary"
                        title="Upload file"
                      >
                        <Upload className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(leftText);
                        toast({ title: 'Copied!', description: 'Text A copied to clipboard' });
                      }}
                      disabled={!leftText.trim()}
                      className="h-7 px-2 text-muted-foreground hover:text-foreground"
                      title="Copy to clipboard"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setLeftText('');
                        setLeftFileName('');
                      }}
                      disabled={!leftText.trim()}
                      className="h-7 px-2 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <Textarea
                  placeholder="Paste original text or JSON here..."
                  value={leftText}
                  onChange={(e) => {
                    setLeftText(e.target.value);
                    if (!realTimeDiff) setHasCompared(false);
                    if (!e.target.value.trim()) setLeftFileName('');
                  }}
                  className="font-mono text-sm min-h-[200px] resize-y bg-muted/50 border-2 focus:border-primary/50 transition-colors"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-semibold">Text B</Label>
                    {rightFileName && (
                      <Badge variant="outline" className="text-xs">
                        <FileText className="h-3 w-3 mr-1" />
                        {rightFileName}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleFormatJson('right')}
                      disabled={!canFormat(rightText)}
                      className="h-7 px-2 text-muted-foreground hover:text-accent gap-1"
                      title="Format JSON"
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                      <span className="text-xs">Format</span>
                    </Button>
                    <div className="relative">
                      <input
                        type="file"
                        accept=".txt,.json,.js,.ts,.html,.css,.md,.xml,.csv,.log"
                        onChange={handleFileUpload('right')}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        title="Upload file"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-muted-foreground hover:text-accent"
                        title="Upload file"
                      >
                        <Upload className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(rightText);
                        toast({ title: 'Copied!', description: 'Text B copied to clipboard' });
                      }}
                      disabled={!rightText.trim()}
                      className="h-7 px-2 text-muted-foreground hover:text-foreground"
                      title="Copy to clipboard"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setRightText('');
                        setRightFileName('');
                      }}
                      disabled={!rightText.trim()}
                      className="h-7 px-2 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <Textarea
                  placeholder="Paste modified text or JSON here..."
                  value={rightText}
                  onChange={(e) => {
                    setRightText(e.target.value);
                    if (!realTimeDiff) setHasCompared(false);
                    if (!e.target.value.trim()) setRightFileName('');
                  }}
                  className="font-mono text-sm min-h-[200px] resize-y bg-muted/50 border-2 focus:border-accent/50 transition-colors"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button 
                onClick={handleCompare}
                disabled={!leftText.trim() && !rightText.trim()}
                className="flex-1 h-12 text-base font-semibold shadow-md hover:shadow-lg transition-all"
                size="lg"
              >
                <ArrowRightLeft className="mr-2 h-5 w-5" />
                Compare Texts
              </Button>
              {diff?.hasDifferences && !mergeMode && (
                <Button
                  onClick={handleStartMerge}
                  variant="outline"
                  className="h-12 px-6 border-2 hover:bg-primary/10"
                  size="lg"
                >
                  <GitMerge className="mr-2 h-5 w-5" />
                  Start Merge
                </Button>
              )}
              <Button
                variant="outline"
                onClick={handleClear}
                disabled={!leftText.trim() && !rightText.trim()}
                className="h-12 lg:hidden"
                size="lg"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results Section */}
        {diff && (
          <Card className="border-0 shadow-lg overflow-hidden">
            <CardHeader className="pb-4 bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  Comparison Result
                  {diff.hasDifferences ? (
                    <Badge variant="warning" className="ml-2">Differences Found</Badge>
                  ) : (
                    <Badge variant="success" className="ml-2">Identical</Badge>
                  )}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSaveResults}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    <span>Save Results</span>
                  </Button>
                  {diff.hasDifferences && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => setShowMergeDialog(true)}
                      className="gap-2"
                    >
                      <GitMerge className="h-4 w-4" />
                      <span>Merge Mode</span>
                    </Button>
                  )}
                  {mergeMode && (
                    <>
                      <Badge variant="secondary">Merge Mode Active</Badge>
                      <Button
                        size="sm"
                        onClick={handleFinishMerge}
                        className="gap-1"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy Merged Result
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x border-t overflow-hidden">
                <DiffPanel
                  title="Text A"
                  lines={diff.left}
                  lineCount={leftText.split('\n').length}
                  removals={diff.removals}
                  side="left"
                  content={leftText}
                  icon={Globe}
                  accentColor="primary"
                  isJson={isJson}
                  onAcceptChange={handleAcceptChange}
                  onRejectChange={handleRejectChange}
                  showMergeControls={mergeMode}
                />
                <DiffPanel
                  title="Text B"
                  lines={diff.right}
                  lineCount={rightText.split('\n').length}
                  additions={diff.additions}
                  side="right"
                  content={rightText}
                  icon={Server}
                  accentColor="accent"
                  isJson={isJson}
                  onAcceptChange={handleAcceptChange}
                  onRejectChange={handleRejectChange}
                  showMergeControls={mergeMode}
                />
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Merged Result Section */}
        {mergeMode && mergedText && (
          <Card className="border-0 shadow-lg overflow-hidden">
            <CardHeader className="pb-4 bg-gradient-to-r from-green-500/10 via-emerald-500/10 to-green-500/10">
              <CardTitle className="text-lg flex items-center gap-2">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <GitMerge className="h-5 w-5 text-green-600" />
                </div>
                Merged Result
                <Badge variant="outline" className="ml-2">
                  {acceptedChanges.size} changes applied
                </Badge>
              </CardTitle>
              <CardDescription>
                This is the result of applying your selected changes
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <Textarea
                value={mergedText}
                onChange={(e) => setMergedText(e.target.value)}
                className="font-mono text-sm min-h-[300px] resize-y bg-muted/50 border-2 focus:border-green-500/50"
                placeholder="Merged text will appear here..."
              />
              <div className="flex gap-3 mt-4">
                <Button 
                  onClick={handleFinishMerge}
                  className="flex-1"
                  size="lg"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy to Clipboard
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setMergeMode(false);
                    setAcceptedChanges(new Set());
                  }}
                  size="lg"
                >
                  Exit Merge Mode
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>

    {/* Merge Dialog */}
    {diff && (
      <Dialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] overflow-hidden p-0">
          <MergeView
            leftLines={diff.left}
            rightLines={diff.right}
            leftTitle="Text A"
            rightTitle="Text B"
            onClose={() => setShowMergeDialog(false)}
          />
        </DialogContent>
      </Dialog>
    )}

    {/* Find & Replace Dialog */}
    <Dialog open={showFindReplaceDialog} onOpenChange={setShowFindReplaceDialog}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Replace className="h-5 w-5" />
            Find & Replace
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="find-text">Find</Label>
            <input
              id="find-text"
              type="text"
              value={findText}
              onChange={(e) => setFindText(e.target.value)}
              placeholder="Enter text to find..."
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            />
            <p className="text-xs text-muted-foreground">
              Use \n for newline, \t for tab, \r for carriage return
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="replace-text">Replace with</Label>
            <input
              id="replace-text"
              type="text"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              placeholder="Enter replacement text..."
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            />
            <p className="text-xs text-muted-foreground">
              Use \n for newline, \t for tab, etc.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Apply to</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setReplaceTarget('left')}
                className={`px-3 py-1 text-xs rounded-md border transition-colors ${
                  replaceTarget === 'left'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-input hover:bg-accent'
                }`}
              >
                Text A only
              </button>
              <button
                type="button"
                onClick={() => setReplaceTarget('right')}
                className={`px-3 py-1 text-xs rounded-md border transition-colors ${
                  replaceTarget === 'right'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-input hover:bg-accent'
                }`}
              >
                Text B only
              </button>
              <button
                type="button"
                onClick={() => setReplaceTarget('both')}
                className={`px-3 py-1 text-xs rounded-md border transition-colors ${
                  replaceTarget === 'both'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-input hover:bg-accent'
                }`}
              >
                Both texts
              </button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowFindReplaceDialog(false);
              setFindText('');
              setReplaceText('');
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleFindReplace}>
            Replace All
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
