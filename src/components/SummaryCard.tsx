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
        <div className="grid grid-cols-2 gap-4">
          {/* Original Domain */}
          <div className="p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">Original Domain</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Status</p>
                <Badge variant={original.success && original.status < 400 ? 'default' : 'destructive'}>
                  {original.status} {original.statusText}
                </Badge>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground mb-1">Size</p>
                <span className="font-medium text-sm">{formatSize(original.size)}</span>
              </div>
            </div>
          </div>

          {/* Localhost */}
          <div className="p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-2 mb-3">
              <Server className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">Localhost</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Status</p>
                <Badge variant={localhost.success && localhost.status < 400 ? 'default' : 'destructive'}>
                  {localhost.status} {localhost.statusText}
                </Badge>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground mb-1">Size</p>
                <span className="font-medium text-sm">{formatSize(localhost.size)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Summary Row */}
        <div className="mt-4 pt-4 border-t flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {statusMatch ? (
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--diff-added))]" />
              ) : (
                <XCircle className="h-4 w-4 text-[hsl(var(--diff-removed))]" />
              )}
              <span className="text-sm">Status {statusMatch ? 'Match' : 'Mismatch'}</span>
            </div>
            <div className="flex items-center gap-2">
              {bothSuccessful ? (
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--diff-added))]" />
              ) : (
                <XCircle className="h-4 w-4 text-[hsl(var(--diff-removed))]" />
              )}
              <span className="text-sm">Both Successful</span>
            </div>
          </div>
          <div>
            {hasDifferences ? (
              <Badge variant="destructive" className="gap-1">
                <FileText className="h-3 w-3" />
                Differences Found
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1 bg-[hsl(var(--diff-added-bg))] text-[hsl(var(--diff-added))]">
                <CheckCircle2 className="h-3 w-3" />
                No Differences
              </Badge>
            )}
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
