import { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { JsonSyntaxHighlight } from './JsonSyntaxHighlight';

interface FoldableJsonProps {
  content: string;
  className?: string;
}

interface JsonNode {
  key?: string;
  value: any;
  type: 'object' | 'array' | 'primitive';
  path: string;
  depth: number;
}

function getNodePreview(value: any): string {
  if (Array.isArray(value)) {
    return `[${value.length} items]`;
  }
  if (typeof value === 'object' && value !== null) {
    const keys = Object.keys(value);
    return `{${keys.length} keys}`;
  }
  return JSON.stringify(value);
}

function JsonNodeLine({ 
  nodeKey, 
  value, 
  depth, 
  isLast, 
  isCollapsible, 
  isCollapsed, 
  onToggle,
  path,
}: {
  nodeKey?: string;
  value: any;
  depth: number;
  isLast: boolean;
  isCollapsible: boolean;
  isCollapsed: boolean;
  onToggle: () => void;
  path: string;
}) {
  const indent = depth * 16;
  const isArray = Array.isArray(value);
  const isObject = typeof value === 'object' && value !== null && !isArray;

  const renderValue = () => {
    if (isCollapsible) {
      if (isCollapsed) {
        return (
          <span className="text-muted-foreground italic">
            {getNodePreview(value)}
          </span>
        );
      }
      return <span className="text-[hsl(var(--syntax-bracket))]">{isArray ? '[' : '{'}</span>;
    }
    return <JsonSyntaxHighlight content={JSON.stringify(value)} />;
  };

  return (
    <div 
      className={cn(
        "flex items-start font-mono text-sm hover:bg-muted/30 transition-colors",
        isCollapsible && "cursor-pointer"
      )}
      onClick={isCollapsible ? onToggle : undefined}
    >
      <div 
        className="flex items-center flex-shrink-0"
        style={{ paddingLeft: `${indent}px` }}
      >
        {isCollapsible && (
          <span className="w-4 h-4 flex items-center justify-center text-muted-foreground mr-1">
            {isCollapsed ? (
              <ChevronRight className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </span>
        )}
        {!isCollapsible && <span className="w-4 mr-1" />}
      </div>
      <div className="py-0.5 flex-1">
        {nodeKey !== undefined && (
          <>
            <span className="text-[hsl(var(--syntax-key))]">"{nodeKey}"</span>
            <span className="text-[hsl(var(--syntax-punctuation))]">: </span>
          </>
        )}
        {renderValue()}
        {!isCollapsible && !isLast && <span className="text-[hsl(var(--syntax-punctuation))]">,</span>}
        {isCollapsible && isCollapsed && !isLast && <span className="text-[hsl(var(--syntax-punctuation))]">,</span>}
      </div>
    </div>
  );
}

function ClosingBracket({ depth, isArray, isLast }: { depth: number; isArray: boolean; isLast: boolean }) {
  const indent = depth * 16;
  return (
    <div 
      className="font-mono text-sm py-0.5"
      style={{ paddingLeft: `${indent + 20}px` }}
    >
      <span className="text-[hsl(var(--syntax-bracket))]">{isArray ? ']' : '}'}</span>
      {!isLast && <span className="text-[hsl(var(--syntax-punctuation))]">,</span>}
    </div>
  );
}

export function FoldableJson({ content, className }: FoldableJsonProps) {
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());

  const parsedJson = useMemo(() => {
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  }, [content]);

  const togglePath = useCallback((path: string) => {
    setCollapsedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    if (!parsedJson) return;
    const paths = new Set<string>();
    const collectPaths = (obj: any, path: string) => {
      if (Array.isArray(obj)) {
        paths.add(path);
        obj.forEach((item, idx) => collectPaths(item, `${path}[${idx}]`));
      } else if (typeof obj === 'object' && obj !== null) {
        paths.add(path);
        Object.entries(obj).forEach(([key, val]) => collectPaths(val, `${path}.${key}`));
      }
    };
    collectPaths(parsedJson, 'root');
    setCollapsedPaths(paths);
  }, [parsedJson]);

  const expandAll = useCallback(() => {
    setCollapsedPaths(new Set());
  }, []);

  if (!parsedJson) {
    // Not valid JSON, render as plain text with syntax highlighting
    return (
      <div className={cn("font-mono text-sm", className)}>
        {content.split('\n').map((line, idx) => (
          <div key={idx} className="py-0.5 px-4">
            <JsonSyntaxHighlight content={line} />
          </div>
        ))}
      </div>
    );
  }

  const renderNode = (value: any, key: string | undefined, path: string, depth: number, isLast: boolean): React.ReactNode => {
    const isArray = Array.isArray(value);
    const isObject = typeof value === 'object' && value !== null && !isArray;
    const isCollapsible = isArray || isObject;
    const isCollapsed = collapsedPaths.has(path);

    const elements: React.ReactNode[] = [];

    elements.push(
      <JsonNodeLine
        key={`${path}-line`}
        nodeKey={key}
        value={value}
        depth={depth}
        isLast={isLast}
        isCollapsible={isCollapsible}
        isCollapsed={isCollapsed}
        onToggle={() => togglePath(path)}
        path={path}
      />
    );

    if (isCollapsible && !isCollapsed) {
      if (isArray) {
        value.forEach((item: any, idx: number) => {
          elements.push(
            <div key={`${path}[${idx}]`}>
              {renderNode(item, undefined, `${path}[${idx}]`, depth + 1, idx === value.length - 1)}
            </div>
          );
        });
      } else if (isObject) {
        const entries = Object.entries(value);
        entries.forEach(([k, v], idx) => {
          elements.push(
            <div key={`${path}.${k}`}>
              {renderNode(v, k, `${path}.${k}`, depth + 1, idx === entries.length - 1)}
            </div>
          );
        });
      }
      elements.push(
        <ClosingBracket 
          key={`${path}-close`} 
          depth={depth} 
          isArray={isArray} 
          isLast={isLast} 
        />
      );
    }

    return elements;
  };

  return (
    <div className={cn("relative", className)}>
      <div className="absolute top-2 right-2 flex gap-1 z-10">
        <button
          onClick={collapseAll}
          className="px-2 py-1 text-xs bg-muted hover:bg-muted/80 rounded text-muted-foreground hover:text-foreground transition-colors"
        >
          Collapse All
        </button>
        <button
          onClick={expandAll}
          className="px-2 py-1 text-xs bg-muted hover:bg-muted/80 rounded text-muted-foreground hover:text-foreground transition-colors"
        >
          Expand All
        </button>
      </div>
      <div className="pt-8">
        {renderNode(parsedJson, undefined, 'root', 0, true)}
      </div>
    </div>
  );
}
