import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowRightLeft, FileText, Copy, Trash2, Minus, Plus, Globe, Server } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { computeDiff, formatJson, DiffLine } from '@/lib/diffAlgorithm';
import { cn } from '@/lib/utils';
import { JsonSyntaxHighlight } from './JsonSyntaxHighlight';

function DiffLineComponent({ line, isJson }: { line: DiffLine; isJson?: boolean }) {
  const bgClass = {
    added: 'bg-[hsl(var(--diff-added-bg))]',
    removed: 'bg-[hsl(var(--diff-removed-bg))]',
    unchanged: '',
    empty: 'bg-muted/30',
  }[line.type];

  const textClass = {
    added: 'text-[hsl(var(--diff-added))]',
    removed: 'text-[hsl(var(--diff-removed))]',
    unchanged: 'text-foreground',
    empty: '',
  }[line.type];

  return (
    <div className={cn('flex font-mono text-sm', bgClass)}>
      <div className="w-12 flex-shrink-0 px-2 py-0.5 text-right text-[hsl(var(--diff-line-number))] bg-[hsl(var(--diff-line-number-bg))] select-none border-r border-border">
        {line.lineNumber ?? ''}
      </div>
      <div className="w-6 flex-shrink-0 flex items-center justify-center text-xs">
        {line.type === 'added' && <Plus className="h-3 w-3 text-[hsl(var(--diff-added))]" />}
        {line.type === 'removed' && <Minus className="h-3 w-3 text-[hsl(var(--diff-removed))]" />}
      </div>
      <pre className={cn('flex-1 px-2 py-0.5 overflow-x-auto whitespace-pre', line.type !== 'unchanged' && textClass)}>
        {isJson && line.type === 'unchanged' ? (
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
        {lines.map((line, idx) => (
          <DiffLineComponent key={idx} line={line} isJson={isJson} />
        ))}
      </div>
    </div>
  );
}

export function TextDiffChecker() {
  const [leftText, setLeftText] = useState('');
  const [rightText, setRightText] = useState('');
  const [hasCompared, setHasCompared] = useState(false);

  const isJson = useMemo(() => {
    try {
      JSON.parse(leftText);
      JSON.parse(rightText);
      return true;
    } catch {
      return false;
    }
  }, [leftText, rightText]);

  const diff = useMemo(() => {
    if (!hasCompared) return null;
    const left = isJson ? formatJson(leftText) : leftText;
    const right = isJson ? formatJson(rightText) : rightText;
    return computeDiff(left, right);
  }, [leftText, rightText, hasCompared, isJson]);

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

  return (
    <div className="space-y-6">
      {/* Input Section */}
      <Card className="overflow-hidden border-0 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-accent/10 via-primary/10 to-accent/10 pb-6">
          <CardTitle className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-accent/20 shadow-sm">
              <FileText className="h-5 w-5 text-accent" />
            </div>
            <span>Text / JSON Comparison</span>
          </CardTitle>
          <CardDescription className="text-base">
            Paste two texts or JSON objects to compare them side by side
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Original Text</Label>
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
              <Textarea
                placeholder="Paste original text or JSON here..."
                value={leftText}
                onChange={(e) => { setLeftText(e.target.value); setHasCompared(false); }}
                className="font-mono text-sm min-h-[200px] resize-y bg-muted/50 border-2 focus:border-primary/50 transition-colors"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Modified Text</Label>
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
              <Textarea
                placeholder="Paste modified text or JSON here..."
                value={rightText}
                onChange={(e) => { setRightText(e.target.value); setHasCompared(false); }}
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
              className="h-12"
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
                title="Original"
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
                title="Modified"
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
  );
}
