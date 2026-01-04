import { useState, useEffect } from 'react';
import { Settings2, Eye, Filter, GitBranch, Search, X, Info, Zap } from 'lucide-react';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { DiffOptions } from '@/lib/enhancedDiffAlgorithm';
import { cn } from '@/lib/utils';

interface DiffOptionsProps {
  options: DiffOptions;
  onOptionsChange: (options: DiffOptions) => void;
  structuralChangesCount?: number;
  className?: string;
  contentSize?: number; // Size in lines or characters
}

export function DiffOptionsPanel({ 
  options, 
  onOptionsChange, 
  structuralChangesCount = 0,
  className,
  contentSize = 0
}: DiffOptionsProps) {
  const [ignoreKeysInput, setIgnoreKeysInput] = useState('');
  const [ignorePathsInput, setIgnorePathsInput] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [advancedModeOverride, setAdvancedModeOverride] = useState(false);
  
  // Auto-disable advanced mode for large files
  const isLargeFile = contentSize > 5000;
  const defaultAdvancedMode = !isLargeFile;
  
  // Initialize advanced mode based on file size
  useEffect(() => {
    if (options.advancedMode === undefined) {
      onOptionsChange({ ...options, advancedMode: defaultAdvancedMode });
    } else if (isLargeFile && options.advancedMode && !advancedModeOverride) {
      // Auto-disable for large files unless user has overridden
      onOptionsChange({ ...options, advancedMode: false });
    }
  }, [contentSize]);
  
  const handleAdvancedModeChange = (checked: boolean) => {
    onOptionsChange({ ...options, advancedMode: checked });
    if (isLargeFile && checked) {
      setAdvancedModeOverride(true);
    }
  };

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
    options.advancedMode,
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

          <ScrollArea className="h-[450px] pr-4">
            <div className="space-y-4">
              {/* Advanced Mode Toggle */}
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    <div className="space-y-0.5">
                      <Label htmlFor="advancedMode" className="text-sm font-medium cursor-pointer">
                        Advanced Mode
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {isLargeFile ? 
                          <span className="text-amber-600">Auto-disabled for large files (&gt;5000 lines)</span> :
                          'Character & word-level diffs, structural analysis'
                        }
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[300px]">
                          <div className="space-y-2 text-sm">
                            <p className="font-medium">Advanced Mode Features:</p>
                            <ul className="list-disc list-inside space-y-1 text-xs">
                              <li>Character-level diff highlighting</li>
                              <li>Word-by-word comparison</li>
                              <li>Structural change detection</li>
                              <li>Property move/rename tracking</li>
                              <li>Similarity analysis</li>
                            </ul>
                            <p className="text-xs text-muted-foreground pt-2">
                              ⚠️ May impact performance on large files. Automatically disabled for files &gt;5000 lines but can be manually enabled.
                            </p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Switch
                      id="advancedMode"
                      checked={options.advancedMode !== false}
                      onCheckedChange={handleAdvancedModeChange}
                      className={isLargeFile && options.advancedMode ? 'data-[state=checked]:bg-amber-600' : ''}
                    />
                  </div>
                </div>
              </div>

              <Separator />
              
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