import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Copy, Minus, Plus, Globe, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { ApiResponse } from '@/lib/requestExecutor';
import { computeDiff, formatJson, formatHeaders, DiffLine } from '@/lib/diffAlgorithm';
import { cn } from '@/lib/utils';

interface DiffViewerProps {
  original: ApiResponse;
  localhost: ApiResponse;
}

function DiffLineComponent({ line, side }: { line: DiffLine; side: 'left' | 'right' }) {
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
      <pre className={cn('flex-1 px-2 py-0.5 overflow-x-auto whitespace-pre', textClass)}>
        {line.content || ' '}
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
}: { 
  title: string;
  lines: DiffLine[];
  lineCount: number;
  additions?: number;
  removals?: number;
  side: 'left' | 'right';
  content: string;
  icon: typeof Globe;
}) {
  const copyToClipboard = () => {
    navigator.clipboard.writeText(content);
    toast({
      title: 'Copied!',
      description: 'Content copied to clipboard',
    });
  };

  return (
    <div className="flex flex-col h-full min-w-0">
      <div className="flex items-center justify-between p-3 border-b bg-card">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">{title}</span>
          {side === 'left' && removals !== undefined && removals > 0 && (
            <Badge variant="destructive" className="gap-1 text-xs">
              <Minus className="h-3 w-3" />
              {removals} removal{removals !== 1 ? 's' : ''}
            </Badge>
          )}
          {side === 'right' && additions !== undefined && additions > 0 && (
            <Badge className="gap-1 text-xs bg-[hsl(var(--diff-added))] hover:bg-[hsl(var(--diff-added))]/90">
              <Plus className="h-3 w-3" />
              {additions} addition{additions !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{lineCount} lines</span>
          <Button variant="ghost" size="sm" onClick={copyToClipboard} className="h-7 px-2">
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="min-w-0">
          {lines.map((line, idx) => (
            <DiffLineComponent key={idx} line={line} side={side} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

export function DiffViewer({ original, localhost }: DiffViewerProps) {
  const bodyDiff = useMemo(() => {
    const leftFormatted = formatJson(original.body);
    const rightFormatted = formatJson(localhost.body);
    return computeDiff(leftFormatted, rightFormatted);
  }, [original.body, localhost.body]);

  const headersDiff = useMemo(() => {
    const leftHeaders = formatHeaders(original.headers);
    const rightHeaders = formatHeaders(localhost.headers);
    return computeDiff(leftHeaders, rightHeaders);
  }, [original.headers, localhost.headers]);

  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader className="pb-0 flex-shrink-0">
        <CardTitle className="text-lg">Response Comparison</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-0 overflow-hidden">
        <Tabs defaultValue="body" className="flex flex-col h-full">
          <div className="px-6 pt-4">
            <TabsList>
              <TabsTrigger value="body" className="gap-2">
                Response Body
                {bodyDiff.hasDifferences && (
                  <span className="w-2 h-2 rounded-full bg-destructive" />
                )}
              </TabsTrigger>
              <TabsTrigger value="headers" className="gap-2">
                Headers
                {headersDiff.hasDifferences && (
                  <span className="w-2 h-2 rounded-full bg-destructive" />
                )}
              </TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="body" className="m-0 border-t mt-4">
            <div className="grid grid-cols-2 divide-x h-[500px] overflow-hidden">
              <DiffPanel
                title="Original Domain"
                lines={bodyDiff.left}
                lineCount={original.body.split('\n').length}
                removals={bodyDiff.removals}
                side="left"
                content={original.body}
                icon={Globe}
              />
              <DiffPanel
                title="Localhost"
                lines={bodyDiff.right}
                lineCount={localhost.body.split('\n').length}
                additions={bodyDiff.additions}
                side="right"
                content={localhost.body}
                icon={Server}
              />
            </div>
          </TabsContent>
          
          <TabsContent value="headers" className="m-0 border-t mt-4">
            <div className="grid grid-cols-2 divide-x h-[500px] overflow-hidden">
              <DiffPanel
                title="Original Domain"
                lines={headersDiff.left}
                lineCount={Object.keys(original.headers).length}
                removals={headersDiff.removals}
                side="left"
                content={formatHeaders(original.headers)}
                icon={Globe}
              />
              <DiffPanel
                title="Localhost"
                lines={headersDiff.right}
                lineCount={Object.keys(localhost.headers).length}
                additions={headersDiff.additions}
                side="right"
                content={formatHeaders(localhost.headers)}
                icon={Server}
              />
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
