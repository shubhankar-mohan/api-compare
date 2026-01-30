import { useState, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Terminal, ArrowRightLeft, Loader2, Sparkles, X, Copy, History, Clock, Trash2, ToggleLeft } from 'lucide-react';
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
  const [isCompareMode, setIsCompareMode] = useState(false); // false = production-localhost mode, true = any environment mode
  const { history, saveToHistory, removeFromHistory, clearHistory } = useCurlHistory();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isCompareMode) {
      // In compare mode, both fields should have cURL commands
      if (curlCommand.length > 0 || localhostUrl.length > 0) {
        saveToHistory(curlCommand, localhostUrl);
        onSubmit(curlCommand, localhostUrl);
      }
    } else {
      // In production-localhost mode, we need at least the cURL command
      if (curlCommand.length > 0) {
        const baseUrl = localhostUrl || 'http://localhost:8080';
        saveToHistory(curlCommand, baseUrl);
        onSubmit(curlCommand, baseUrl);
      }
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
    const a = firstLine.length > maxLength ? firstLine.substring(0, maxLength) + "...": firstLine;
    const b = firstLine2.length > maxLength ? firstLine2.substring(0, maxLength) + "...": firstLine2;
    return a + '\n' + b;
  };

  const exampleCurl = `curl 'https://api.example.com/users/123' \\
  -H 'Authorization: Bearer token123' \\
  -H 'Content-Type: application/json'`;

  return (
    <Card className="overflow-hidden border-0 shadow-lg">
      <CardHeader className="bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 pb-6">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/20 shadow-sm">
                <Terminal className="h-5 w-5 text-primary" />
              </div>
              <span>cURL Diff</span>
            </CardTitle>
            <CardDescription className="text-base mt-2">
              {isCompareMode 
                ? 'Compare API responses between any two environments'
                : 'Compare production API with localhost environment'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Label htmlFor="compare-mode" className="text-sm text-muted-foreground">
              {isCompareMode ? 'Prod vs Localhost' : 'Any Environment'}
            </Label>
            <Switch
              id="compare-mode"
              checked={isCompareMode}
              onCheckedChange={setIsCompareMode}
              className="data-[state=checked]:bg-primary"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {history.length > 0 && (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-muted-foreground hover:text-foreground gap-1"
                  >
                    <History className="h-3.5 w-3.5" />
                    <span className="text-xs">History</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  {history.map((item) => (
                    <DropdownMenuItem
                      key={item.id}
                      className="flex items-start justify-between gap-2 py-2"
                      onClick={() => loadFromHistory(item.command, item.localhostUrl)}
                    >
                      <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="h-3 w-3" />
                          {formatTimestamp(item.timestamp)}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground truncate whitespace-pre-line mt-0.5">{truncateCommand(item.command, item.localhostUrl)}</p>
                        {/* <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="h-3 w-3" />
                          {formatTimestamp(item.timestamp)}
                        </p> */}
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
                    className="text-destructive focus:text-destructive"
                    onClick={clearHistory}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                    Clear all history
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          
          {isCompareMode ? (
            // Any Environment Mode - Two cURL commands
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 !mt-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="curl-input-a" className="text-sm font-semibold">cURL Command A</Label>
                  <div className="flex items-center gap-1"> 
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(curlCommand);
                        toast({ title: 'Copied!', description: 'cURL command A copied to clipboard' });
                      }}
                      disabled={!curlCommand.trim()}
                      className="h-7 px-2 text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setCurlCommand('')}
                      disabled={!curlCommand.trim()}
                      className="h-7 px-2 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <Textarea
                  id="curl-input-a"
                  placeholder={exampleCurl}
                  value={curlCommand}
                  onChange={(e) => setCurlCommand(e.target.value)}
                  className="font-mono text-sm min-h-[140px] resize-y bg-muted/50 border-2 focus:border-primary/50 transition-colors"
                />
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="curl-input-b" className="text-sm font-semibold">cURL Command B</Label>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(localhostUrl);
                        toast({ title: 'Copied!', description: 'cURL command B copied to clipboard' });
                      }}
                      disabled={!localhostUrl.trim()}
                      className="h-7 px-2 text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setLocalhostUrl('')}
                      disabled={!localhostUrl.trim()}
                      className="h-7 px-2 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <Textarea
                  id="curl-input-b"
                  placeholder={exampleCurl}
                  value={localhostUrl}
                  onChange={(e) => setLocalhostUrl(e.target.value)}
                  className="font-mono text-sm min-h-[140px] resize-y bg-muted/50 border-2 focus:border-primary/50 transition-colors"
                />
              </div>
            </div>
          ) : (
            // Production vs Localhost Mode - One cURL and localhost URL
            <div className="space-y-4 !mt-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="curl-input" className="text-sm font-semibold">Production cURL Command</Label>
                  <div className="flex items-center gap-1"> 
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(curlCommand);
                        toast({ title: 'Copied!', description: 'cURL command copied to clipboard' });
                      }}
                      disabled={!curlCommand.trim()}
                      className="h-7 px-2 text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setCurlCommand('')}
                      disabled={!curlCommand.trim()}
                      className="h-7 px-2 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <Textarea
                  id="curl-input"
                  placeholder={exampleCurl}
                  value={curlCommand}
                  onChange={(e) => setCurlCommand(e.target.value)}
                  className="font-mono text-sm min-h-[140px] resize-y bg-muted/50 border-2 focus:border-primary/50 transition-colors"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="localhost-url" className="text-sm font-semibold">Localhost Base URL</Label>
                <Input
                  id="localhost-url"
                  type="url"
                  placeholder="http://localhost:8080"
                  value={localhostUrl || 'http://localhost:8080'}
                  onChange={(e) => setLocalhostUrl(e.target.value)}
                  className="font-mono bg-muted/50 border-2 focus:border-primary/50 transition-colors"
                />
                <p className="text-xs text-muted-foreground">
                  The path from your cURL command will be appended to this base URL
                </p>
              </div>
            </div>
          )}

          <Button 
            type="submit" 
            disabled={isLoading || (isCompareMode ? (curlCommand.length === 0 && localhostUrl.length === 0) : curlCommand.length === 0)}
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
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
