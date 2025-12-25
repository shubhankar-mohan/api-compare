import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle2, 
  XCircle, 
  FileText, 
  ArrowLeftRight,
  Globe,
  Server
} from 'lucide-react';
import { ApiResponse } from '@/lib/requestExecutor';

interface SummaryCardProps {
  original: ApiResponse;
  localhost: ApiResponse;
  hasDifferences: boolean;
}

export function SummaryCard({ original, localhost, hasDifferences }: SummaryCardProps) {
  const statusMatch = original.status === localhost.status;
  const bothSuccessful = original.success && localhost.success;

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ArrowLeftRight className="h-5 w-5" />
          Comparison Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Status Match */}
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Status Match</p>
            <div className="flex items-center gap-2">
              {statusMatch ? (
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--diff-added))]" />
              ) : (
                <XCircle className="h-4 w-4 text-[hsl(var(--diff-removed))]" />
              )}
              <span className="font-medium">{statusMatch ? 'Yes' : 'No'}</span>
            </div>
          </div>

          {/* Both Successful */}
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Both Successful</p>
            <div className="flex items-center gap-2">
              {bothSuccessful ? (
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--diff-added))]" />
              ) : (
                <XCircle className="h-4 w-4 text-[hsl(var(--diff-removed))]" />
              )}
              <span className="font-medium">{bothSuccessful ? 'Yes' : 'No'}</span>
            </div>
          </div>

          {/* Response Sizes */}
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Response Sizes</p>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1 text-sm">
                <Globe className="h-3 w-3" />
                <span>{formatSize(original.size)}</span>
              </div>
              <div className="flex items-center gap-1 text-sm">
                <Server className="h-3 w-3" />
                <span>{formatSize(localhost.size)}</span>
              </div>
            </div>
          </div>

          {/* Differences */}
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Differences</p>
            <div className="flex items-center gap-2">
              {hasDifferences ? (
                <Badge variant="destructive" className="gap-1">
                  <FileText className="h-3 w-3" />
                  Found
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1 bg-[hsl(var(--diff-added-bg))] text-[hsl(var(--diff-added))]">
                  <CheckCircle2 className="h-3 w-3" />
                  None
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Status Codes */}
        <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Original</span>
            </div>
            <Badge variant={original.success && original.status < 400 ? 'default' : 'destructive'}>
              {original.status} {original.statusText}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Localhost</span>
            </div>
            <Badge variant={localhost.success && localhost.status < 400 ? 'default' : 'destructive'}>
              {localhost.status} {localhost.statusText}
            </Badge>
          </div>
        </div>

        {/* Error Messages */}
        {(original.error || localhost.error) && (
          <div className="mt-4 pt-4 border-t space-y-2">
            {original.error && (
              <div className="text-sm text-destructive">
                <strong>Original Error:</strong> {original.error}
              </div>
            )}
            {localhost.error && (
              <div className="text-sm text-destructive">
                <strong>Localhost Error:</strong> {localhost.error}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
