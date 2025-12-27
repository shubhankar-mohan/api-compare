import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { 
  ArrowRightLeft, FileText, Copy, Trash2, Minus, Plus, Globe, Server,
  Wand2, CaseLower, SortAsc, WrapText, Scissors, RotateCcw
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { computeDiff, formatJson, DiffLine, DiffSegment } from '@/lib/diffAlgorithm';
import { cn } from '@/lib/utils';
import { JsonSyntaxHighlight } from './JsonSyntaxHighlight';

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
              className="bg-[hsl(var(--diff-removed))/0.3] text-[hsl(var(--diff-removed))] rounded-sm"
            >
              {seg.text}
            </span>
          );
        }
        if (side === 'right' && seg.type === 'added') {
          return (
            <span 
              key={idx} 
              className="bg-[hsl(var(--diff-added))/0.3] text-[hsl(var(--diff-added))] rounded-sm"
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

function DiffLineComponent({ line, isJson, side }: { line: DiffLine; isJson?: boolean; side: 'left' | 'right' }) {
  const bgClass = {
    added: 'bg-[hsl(var(--diff-added-bg))]',
    removed: 'bg-[hsl(var(--diff-removed-bg))]',
    modified: side === 'left' ? 'bg-[hsl(var(--diff-removed-bg))]' : 'bg-[hsl(var(--diff-added-bg))]',
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

  return (
    <div className={cn('flex font-mono text-sm', bgClass)}>
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
      <div className="min-w-0">
        {lines.map((line, idx) => (
          <DiffLineComponent key={idx} line={line} isJson={isJson} side={side} />
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
        "flex items-center gap-2 w-full px-3 py-2 text-sm text-left rounded-lg transition-colors",
        "hover:bg-muted text-foreground",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      {label}
    </button>
  );
}

export function TextDiffChecker() {
  const [leftText, setLeftText] = useState('');
  const [rightText, setRightText] = useState('');
  const [hasCompared, setHasCompared] = useState(false);
  const [realTimeDiff, setRealTimeDiff] = useState(false);

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
    return computeDiff(left, right);
  }, [leftText, rightText, shouldShowDiff, isJson]);

  const handleCompare = () => {
    if (!leftText.trim() && !rightText.trim()) {
      toast({ title: 'Empty input', description: 'Please enter text to compare', variant: 'destructive' });
      return;
    }
    setHasCompared(true);
    toast({ 
      title: 'Comparison complete', 
      description: diff?.hasDifferences ? 'Differences found' : 'Texts are identical' 
    });
  };

  const handleClear = () => {
    setLeftText('');
    setRightText('');
    setHasCompared(false);
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

  return (
    <div className="flex gap-6">
      {/* Left Sidebar - Tools */}
      <div className="w-56 flex-shrink-0 hidden lg:block">
        <Card className="sticky top-24 border-0 shadow-lg">
          <CardContent className="p-4 space-y-4">
            {/* Toggles */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="realtime" className="text-sm">Real-time diff</Label>
                <Switch 
                  id="realtime" 
                  checked={realTimeDiff} 
                  onCheckedChange={setRealTimeDiff}
                />
              </div>
            </div>

            {/* Tools Section */}
            <div className="pt-2 border-t">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Tools</p>
              <div className="space-y-1">
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
      <div className="flex-1 space-y-6">
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Text A</Label>
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
                      onClick={() => setLeftText('')}
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
                  onChange={(e) => { setLeftText(e.target.value); if (!realTimeDiff) setHasCompared(false); }}
                  className="font-mono text-sm min-h-[200px] resize-y bg-muted/50 border-2 focus:border-primary/50 transition-colors"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Text B</Label>
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
                      onClick={() => setRightText('')}
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
                  onChange={(e) => { setRightText(e.target.value); if (!realTimeDiff) setHasCompared(false); }}
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
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-2 divide-x border-t">
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
                />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
