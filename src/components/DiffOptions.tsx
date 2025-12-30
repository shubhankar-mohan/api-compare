import { useState } from 'react';
import { Settings2, Eye, Filter, GitBranch, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DiffOptions } from '@/lib/enhancedDiffAlgorithm';
import { cn } from '@/lib/utils';

interface DiffOptionsProps {
  options: DiffOptions;
  onOptionsChange: (options: DiffOptions) => void;
  structuralChangesCount?: number;
  className?: string;
}

export function DiffOptionsPanel({ 
  options, 
  onOptionsChange, 
  structuralChangesCount = 0,
  className 
}: DiffOptionsProps) {
  const [ignoreKeysInput, setIgnoreKeysInput] = useState('');
  const [ignorePathsInput, setIgnorePathsInput] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const handleAddIgnoreKey = () => {
    if (ignoreKeysInput.trim()) {
      const newKeys = [...(options.ignoreKeys || []), ignoreKeysInput.trim()];
      onOptionsChange({ ...options, ignoreKeys: newKeys });
      setIgnoreKeysInput('');
    }
  };

  const handleAddIgnorePath = () => {
    if (ignorePathsInput.trim()) {
      const newPaths = [...(options.ignorePaths || []), ignorePathsInput.trim()];
      onOptionsChange({ ...options, ignorePaths: newPaths });
      setIgnorePathsInput('');
    }
  };

  const handleRemoveIgnoreKey = (key: string) => {
    const newKeys = (options.ignoreKeys || []).filter(k => k !== key);
    onOptionsChange({ ...options, ignoreKeys: newKeys });
  };

  const handleRemoveIgnorePath = (path: string) => {
    const newPaths = (options.ignorePaths || []).filter(p => p !== path);
    onOptionsChange({ ...options, ignorePaths: newPaths });
  };

  const activeOptionsCount = [
    options.semanticComparison,
    options.ignoreCase,
    options.ignoreWhitespace,
    options.detectArrayMoves,
    (options.ignoreKeys?.length || 0) > 0,
    (options.ignorePaths?.length || 0) > 0,
  ].filter(Boolean).length;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-2", className)}
        >
          <Settings2 className="h-4 w-4" />
          <span className="hidden sm:inline">Diff Options</span>
          {activeOptionsCount > 0 && (
            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
              {activeOptionsCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px]" align="end">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">Diff Options</h4>
            {structuralChangesCount > 0 && (
              <Badge variant="outline" className="gap-1">
                <GitBranch className="h-3 w-3" />
                {structuralChangesCount} structural changes
              </Badge>
            )}
          </div>

          <Separator />

          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-4">
              {/* Comparison Options */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Comparison
                </Label>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="semantic" className="text-sm font-normal">
                      Semantic comparison
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Treat "1" and 1 as equal
                    </p>
                  </div>
                  <Switch
                    id="semantic"
                    checked={options.semanticComparison || false}
                    onCheckedChange={(checked) =>
                      onOptionsChange({ ...options, semanticComparison: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="ignoreCase" className="text-sm font-normal">
                      Ignore case
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Case-insensitive comparison
                    </p>
                  </div>
                  <Switch
                    id="ignoreCase"
                    checked={options.ignoreCase || false}
                    onCheckedChange={(checked) =>
                      onOptionsChange({ ...options, ignoreCase: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="ignoreWhitespace" className="text-sm font-normal">
                      Ignore whitespace
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Normalize spaces and trim
                    </p>
                  </div>
                  <Switch
                    id="ignoreWhitespace"
                    checked={options.ignoreWhitespace || false}
                    onCheckedChange={(checked) =>
                      onOptionsChange({ ...options, ignoreWhitespace: checked })
                    }
                  />
                </div>
              </div>

              <Separator />

              {/* Array Options */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Arrays
                </Label>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="detectMoves" className="text-sm font-normal">
                      Detect reordering
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Track moved array items
                    </p>
                  </div>
                  <Switch
                    id="detectMoves"
                    checked={options.detectArrayMoves || false}
                    onCheckedChange={(checked) =>
                      onOptionsChange({ ...options, detectArrayMoves: checked })
                    }
                  />
                </div>

                {options.detectArrayMoves && (
                  <div className="space-y-2">
                    <Label htmlFor="arrayKey" className="text-sm">
                      Array key field
                    </Label>
                    <Input
                      id="arrayKey"
                      placeholder="e.g., id, key, name"
                      value={options.arrayKeyField || ''}
                      onChange={(e) =>
                        onOptionsChange({ ...options, arrayKeyField: e.target.value })
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                )}
              </div>

              <Separator />

              {/* Ignore Keys */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Ignore Keys
                </Label>
                
                <div className="flex gap-2">
                  <Input
                    placeholder="Key to ignore"
                    value={ignoreKeysInput}
                    onChange={(e) => setIgnoreKeysInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddIgnoreKey()}
                    className="h-8 text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={handleAddIgnoreKey}
                    disabled={!ignoreKeysInput.trim()}
                    className="h-8 px-3"
                  >
                    Add
                  </Button>
                </div>

                {options.ignoreKeys && options.ignoreKeys.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {options.ignoreKeys.map((key) => (
                      <Badge
                        key={key}
                        variant="secondary"
                        className="gap-1 pr-1"
                      >
                        {key}
                        <button
                          onClick={() => handleRemoveIgnoreKey(key)}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Ignore Paths */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Ignore Paths
                </Label>
                
                <div className="flex gap-2">
                  <Input
                    placeholder="$.path.to.ignore"
                    value={ignorePathsInput}
                    onChange={(e) => setIgnorePathsInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddIgnorePath()}
                    className="h-8 text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={handleAddIgnorePath}
                    disabled={!ignorePathsInput.trim()}
                    className="h-8 px-3"
                  >
                    Add
                  </Button>
                </div>

                {options.ignorePaths && options.ignorePaths.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {options.ignorePaths.map((path) => (
                      <Badge
                        key={path}
                        variant="secondary"
                        className="gap-1 pr-1 font-mono text-xs"
                      >
                        {path}
                        <button
                          onClick={() => handleRemoveIgnorePath(path)}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Display Options */}
              <Separator />
              
              <div className="space-y-3">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Display
                </Label>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="onlyDiff" className="text-sm font-normal">
                      Show only differences
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Hide unchanged lines
                    </p>
                  </div>
                  <Switch
                    id="onlyDiff"
                    checked={options.showOnlyDifferences || false}
                    onCheckedChange={(checked) =>
                      onOptionsChange({ ...options, showOnlyDifferences: checked })
                    }
                  />
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Search bar component for searching within diff
export function DiffSearchBar({
  onSearch,
  className
}: {
  onSearch: (query: string, options: { caseSensitive?: boolean; regex?: boolean }) => void;
  className?: string;
}) {
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const handleSearch = () => {
    if (query.trim()) {
      onSearch(query, { caseSensitive, regex: useRegex });
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-2", className)}
        >
          <Search className="h-4 w-4" />
          <span className="hidden sm:inline">Search</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px]" align="end">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search in diff..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />
            <Button
              size="sm"
              onClick={handleSearch}
              disabled={!query.trim()}
            >
              Search
            </Button>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="caseSensitive"
                checked={caseSensitive}
                onCheckedChange={setCaseSensitive}
              />
              <Label htmlFor="caseSensitive" className="text-sm">
                Case sensitive
              </Label>
            </div>
            
            <div className="flex items-center gap-2">
              <Switch
                id="useRegex"
                checked={useRegex}
                onCheckedChange={setUseRegex}
              />
              <Label htmlFor="useRegex" className="text-sm">
                Regex
              </Label>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}