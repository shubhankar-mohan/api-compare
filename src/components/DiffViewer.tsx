import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Minus, Plus, Globe, Server, Code2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { ApiResponse } from '@/lib/requestExecutor';
import { computeDiff, formatJson, formatHeaders, DiffLine } from '@/lib/diffAlgorithm';
import { cn } from '@/lib/utils';
import { JsonSyntaxHighlight } from './JsonSyntaxHighlight';

interface DiffViewerProps {
  original: ApiResponse;
  localhost: ApiResponse;
}

function DiffLineComponent({ line, side, isJson }: { line: DiffLine; side: 'left' | 'right'; isJson?: boolean }) {
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
          <DiffLineComponent key={idx} line={line} side={side} isJson={isJson} />
        ))}
      </div>
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
    <Card className="border-0 shadow-lg overflow-hidden">
      <CardHeader className="pb-0 bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5">
        <CardTitle className="text-lg flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <Code2 className="h-5 w-5 text-primary" />
          </div>
          Response Comparison
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs defaultValue="body" className="flex flex-col">
          <div className="px-6 pt-4">
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
          </div>
          
          <TabsContent value="body" className="m-0 border-t mt-4">
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
              />
            </div>
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
              />
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
