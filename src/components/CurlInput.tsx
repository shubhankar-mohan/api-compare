import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Terminal, ArrowRightLeft, Loader2 } from 'lucide-react';

interface CurlInputProps {
  onSubmit: (curlCommand: string, localhostUrl: string) => void;
  isLoading: boolean;
}

export function CurlInput({ onSubmit, isLoading }: CurlInputProps) {
  const [curlCommand, setCurlCommand] = useState('');
  const [localhostUrl, setLocalhostUrl] = useState('http://localhost:8080');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (curlCommand.trim()) {
      onSubmit(curlCommand, localhostUrl);
    }
  };

  const exampleCurl = `curl 'https://api.example.com/users/123' \\
  -H 'Authorization: Bearer token123' \\
  -H 'Content-Type: application/json'`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Terminal className="h-5 w-5" />
          cURL Command
        </CardTitle>
        <CardDescription>
          Paste your cURL command to compare responses between production and localhost
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="curl-input">cURL Command</Label>
            <Textarea
              id="curl-input"
              placeholder={exampleCurl}
              value={curlCommand}
              onChange={(e) => setCurlCommand(e.target.value)}
              className="font-mono text-sm min-h-[140px] resize-y"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="localhost-url">Localhost Base URL</Label>
            <Input
              id="localhost-url"
              type="url"
              placeholder="http://localhost:8080"
              value={localhostUrl}
              onChange={(e) => setLocalhostUrl(e.target.value)}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              The path from your cURL command will be appended to this base URL
            </p>
          </div>

          <Button 
            type="submit" 
            disabled={!curlCommand.trim() || isLoading}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Comparing...
              </>
            ) : (
              <>
                <ArrowRightLeft className="mr-2 h-4 w-4" />
                Compare Requests
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
