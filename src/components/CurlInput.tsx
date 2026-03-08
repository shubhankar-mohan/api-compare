import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Terminal, ArrowRightLeft, Loader2, X, Copy, History, Clock, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useCurlHistory } from '@/hooks/useCurlHistory';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface CurlInputProps {
  onSubmit: (curlCommand: string, localhostUrl: string) => void;
  isLoading: boolean;
}

export function CurlInput({ onSubmit, isLoading }: CurlInputProps) {
  const [curlCommand, setCurlCommand] = useState('');
  const [localhostUrl, setLocalhostUrl] = useState('');
  const [isCompareMode, setIsCompareMode] = useState(false);
  const { history, saveToHistory, removeFromHistory, clearHistory } = useCurlHistory();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isCompareMode) {
      if (curlCommand.length > 0 && localhostUrl.length > 0) {
        saveToHistory(curlCommand, localhostUrl);
        onSubmit(curlCommand, localhostUrl);
      }
    } else {
      if (curlCommand.length > 0) {
        const baseUrl = localhostUrl || 'http://localhost:8080';
        saveToHistory(curlCommand, baseUrl);
        onSubmit(curlCommand, baseUrl);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !isLoading) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const loadFromHistory = (command: string, url: string) => {
    setCurlCommand(command);
    setLocalhostUrl(url);
    toast({ title: 'Loaded', description: 'cURL command loaded from history' });
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const truncateCommand = (command: string, command2: string, maxLength = 50) => {
    const firstLine = command.split('\n')[0].replace(/\\/g, '').trim();
    const firstLine2 = command2.split('\n')[0].replace(/\\/g, '').trim();
    const a = firstLine.length > maxLength ? firstLine.substring(0, maxLength) + "..." : firstLine;
    const b = firstLine2.length > maxLength ? firstLine2.substring(0, maxLength) + "..." : firstLine2;
    return a + '\n' + b;
  };

  const exampleCurl = `curl 'https://api.example.com/users/123' \\
  -H 'Authorization: Bearer token123' \\
  -H 'Content-Type: application/json'`;

  return (
    <Card className="overflow-hidden border-0 shadow-lg">
      <CardHeader className="bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 pb-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 rounded-xl bg-primary/20 shadow-sm">
                <Terminal className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-xl font-medium">cURL Diff</h3>
            </div>
            <p className="text-base text-muted-foreground">
              {isCompareMode
                ? 'Compare API responses between any two environments'
                : 'Compare production API with localhost environment'}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 mt-1">
            <div className="flex items-center gap-2">
              <Label htmlFor="compare-mode" className="text-sm font-semibold cursor-pointer">
                {isCompareMode ? 'Any Env' : 'Prod vs Local'}
              </Label>
              <Switch
                id="compare-mode"
                checked={isCompareMode}
                onCheckedChange={setIsCompareMode}
                className="data-[state=checked]:bg-primary"
              />
            </div>
            <p className="text-[11px] text-muted-foreground max-w-[200px] text-right">
              {isCompareMode ? 'Paste two full cURL commands to compare' : 'Paste a prod cURL; path is mirrored to localhost'}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <form onSubmit={handleSubmit} className="space-y-5">
          {history.length > 0 && (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-primary gap-1.5">
                    <History className="h-3.5 w-3.5" />
                    <span className="text-sm">History</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80 rounded-2xl">
                  {history.map((item) => (
                    <DropdownMenuItem
                      key={item.id}
                      className="flex items-start justify-between gap-2 py-2 rounded-xl"
                      onClick={() => loadFromHistory(item.command, item.localhostUrl)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="h-3 w-3" />
                          {formatTimestamp(item.timestamp)}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground truncate whitespace-pre-line mt-0.5">{truncateCommand(item.command, item.localhostUrl)}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromHistory(item.id);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive rounded-xl"
                    onClick={() => {
                      if (window.confirm('Clear all saved history? This cannot be undone.')) {
                        clearHistory();
                        toast({ title: 'History cleared', description: 'All saved commands have been removed' });
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                    Clear all history
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {isCompareMode ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 !mt-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="curl-input-a" className="text-sm font-semibold">cURL Command A</Label>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="ghost" size="sm" title="Copy" onClick={() => { navigator.clipboard.writeText(curlCommand); toast({ title: 'Copied!' }); }} disabled={!curlCommand.trim()} className="h-7 w-7 p-0 text-muted-foreground hover:text-primary">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" title="Clear" onClick={() => setCurlCommand('')} disabled={!curlCommand.trim()} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <Textarea id="curl-input-a" placeholder={exampleCurl} value={curlCommand} onChange={(e) => setCurlCommand(e.target.value)} onKeyDown={handleKeyDown} className="font-mono text-sm min-h-[200px] resize-y bg-muted/50 border-2 focus:border-primary/50 transition-colors" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="curl-input-b" className="text-sm font-semibold">cURL Command B</Label>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="ghost" size="sm" title="Copy" onClick={() => { navigator.clipboard.writeText(localhostUrl); toast({ title: 'Copied!' }); }} disabled={!localhostUrl.trim()} className="h-7 w-7 p-0 text-muted-foreground hover:text-primary">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" title="Clear" onClick={() => setLocalhostUrl('')} disabled={!localhostUrl.trim()} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <Textarea id="curl-input-b" placeholder={exampleCurl} value={localhostUrl} onChange={(e) => setLocalhostUrl(e.target.value)} onKeyDown={handleKeyDown} className="font-mono text-sm min-h-[200px] resize-y bg-muted/50 border-2 focus:border-primary/50 transition-colors" />
              </div>
            </div>
          ) : (
            <div className="space-y-4 !mt-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="curl-input" className="text-sm font-semibold">Production cURL Command</Label>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="ghost" size="sm" title="Copy" onClick={() => { navigator.clipboard.writeText(curlCommand); toast({ title: 'Copied!' }); }} disabled={!curlCommand.trim()} className="h-7 w-7 p-0 text-muted-foreground hover:text-primary">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" title="Clear" onClick={() => setCurlCommand('')} disabled={!curlCommand.trim()} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <Textarea id="curl-input" placeholder={exampleCurl} value={curlCommand} onChange={(e) => setCurlCommand(e.target.value)} onKeyDown={handleKeyDown} className="font-mono text-sm min-h-[200px] resize-y bg-muted/50 border-2 focus:border-primary/50 transition-colors" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="localhost-url" className="text-sm font-semibold">Localhost Base URL</Label>
                <Input id="localhost-url" placeholder="http://localhost:8080" value={localhostUrl} onChange={(e) => setLocalhostUrl(e.target.value)} className="font-mono text-sm bg-muted/50 border-2 focus:border-primary/50 transition-colors" />
                <p className="text-sm text-muted-foreground">
                  The path from your cURL command will be appended to this base URL
                </p>
              </div>
            </div>
          )}

          <Button
            type="submit"
            disabled={isLoading || (isCompareMode ? (curlCommand.length === 0 || localhostUrl.length === 0) : curlCommand.length === 0)}
            className="w-full h-12 text-base font-semibold shadow-md hover:shadow-lg transition-all"
            size="lg"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Comparing...
              </>
            ) : (
              <>
                <ArrowRightLeft className="mr-2 h-5 w-5" />
                Get and Compare Responses
                <kbd className="ml-2 px-2 py-0.5 text-xs font-mono bg-primary-foreground/20 rounded-full hidden sm:inline-block">
                  {navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'}+↵
                </kbd>
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
