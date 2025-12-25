import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Globe, Server } from 'lucide-react';
import { ApiResponse } from '@/lib/requestExecutor';

interface ErrorDisplayProps {
  original: ApiResponse;
  localhost: ApiResponse;
}

interface ErrorCardProps {
  title: string;
  response: ApiResponse;
  icon: typeof Globe;
}

function ErrorCard({ title, response, icon: Icon }: ErrorCardProps) {
  return (
    <div className="flex flex-col gap-3 p-4 rounded-lg border bg-card">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{title}</span>
        {response.success ? (
          <Badge variant="outline" className="text-[hsl(var(--diff-added))] border-[hsl(var(--diff-added))]">
            Success
          </Badge>
        ) : (
          <Badge variant="destructive">Failed</Badge>
        )}
      </div>
      
      <div className="text-sm text-muted-foreground">
        <div className="font-mono text-xs mb-1 truncate">{response.url}</div>
        {response.success ? (
          <div className="flex items-center gap-4">
            <span>Status: <strong className="text-foreground">{response.status}</strong></span>
            <span>Size: <strong className="text-foreground">{response.size} bytes</strong></span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{response.error || 'Request failed'}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function ErrorDisplay({ original, localhost }: ErrorDisplayProps) {
  const bothFailed = !original.success && !localhost.success;
  const onlyOriginalFailed = !original.success && localhost.success;
  const onlyLocalhostFailed = original.success && !localhost.success;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertCircle className="h-5 w-5 text-destructive" />
          Request Error
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground">
          {bothFailed && 'Both requests failed. Please check the URLs and try again.'}
          {onlyOriginalFailed && 'The original domain request failed. Comparison is not possible.'}
          {onlyLocalhostFailed && 'The localhost request failed. Make sure your local server is running and accessible.'}
        </p>
        
        <div className="grid gap-4 md:grid-cols-2">
          <ErrorCard title="Original Domain" response={original} icon={Globe} />
          <ErrorCard title="Localhost" response={localhost} icon={Server} />
        </div>

        {onlyLocalhostFailed && (
          <div className="p-4 rounded-lg bg-muted/50 text-sm">
            <p className="font-medium mb-2">Common issues:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Local server is not running</li>
              <li>Wrong port number in localhost URL</li>
              <li>CORS not configured on your local server</li>
              <li>Firewall blocking the connection</li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
