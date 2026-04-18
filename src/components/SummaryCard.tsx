import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  XCircle,
  FileText,
  ArrowLeftRight,
  Globe,
  Server,
  Zap,
  Clock
} from 'lucide-react';
import { ApiResponse } from '@/lib/requestExecutor';

interface SummaryCardProps {
  original: ApiResponse;
  localhost: ApiResponse;
  hasDifferences: boolean;
  /** True when computeDiffStatistics was skipped due to input size. */
  statsSkipped?: boolean;
}

export function SummaryCard({ original, localhost, hasDifferences, statsSkipped }: SummaryCardProps) {
  const statusMatch = original.status === localhost.status;
  const bothSuccessful = original.success && localhost.success;

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatTime = (ms?: number): string => {
    if (ms === undefined) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const getStatusVariant = (status: number, success: boolean) => {
    if (!success || status >= 500) return 'destructive';
    if (status >= 400) return 'warning';
    if (status >= 200 && status < 300) return 'success';
    return 'secondary';
  };

  return (
    <Card className="overflow-hidden border-0 shadow-lg">
      <CardHeader className="bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5 pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/20 shadow-sm">
            <ArrowLeftRight className="h-5 w-5 text-primary" />
          </div>
          <h3 className="text-xl font-medium">Comparison Summary</h3>
        </div>
      </CardHeader>
      <CardContent className="pt-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Original Domain */}
          <div className="p-5 rounded-2xl bg-background hover:shadow-sm transition-all duration-300">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 rounded-xl bg-primary/10">
                <Globe className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm font-semibold text-muted-foreground">Original Domain</span>
            </div>
            <p className="text-xs text-muted-foreground font-mono truncate mb-3" title={original.url}>
              {original.url}
            </p>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Status</p>
                <Badge variant={getStatusVariant(original.status, original.success) as any} className="text-sm px-3 py-1">
                  {original.status} {original.statusText}
                </Badge>
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Size</p>
                <div className="flex items-center gap-1.5">
                  <Zap className="h-4 w-4 text-warning" />
                  <span className="text-lg font-medium">{formatSize(original.size)}</span>
                </div>
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Time</p>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-lg font-medium">{formatTime(original.responseTime)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Localhost */}
          <div className="p-5 rounded-2xl bg-background hover:shadow-sm transition-all duration-300">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 rounded-xl bg-accent/10">
                <Server className="h-4 w-4 text-accent" />
              </div>
              <span className="text-sm font-semibold text-muted-foreground">Localhost</span>
            </div>
            <p className="text-xs text-muted-foreground font-mono truncate mb-3" title={localhost.url}>
              {localhost.url}
            </p>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Status</p>
                <Badge variant={getStatusVariant(localhost.status, localhost.success) as any} className="text-sm px-3 py-1">
                  {localhost.status} {localhost.statusText}
                </Badge>
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Size</p>
                <div className="flex items-center gap-1.5">
                  <Zap className="h-4 w-4 text-warning" />
                  <span className="text-lg font-medium">{formatSize(localhost.size)}</span>
                </div>
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Time</p>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-lg font-medium">{formatTime(localhost.responseTime)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Summary Row */}
        <div className="mt-6 pt-6 border-t flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-full ${statusMatch ? 'bg-success/10' : 'bg-destructive/10'}`}>
                {statusMatch ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-destructive" />}
              </div>
              <span className="text-sm font-medium">Status {statusMatch ? 'Match' : 'Mismatch'}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-full ${bothSuccessful ? 'bg-success/10' : 'bg-destructive/10'}`}>
                {bothSuccessful ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-destructive" />}
              </div>
              <span className="text-sm font-medium">Both Successful</span>
            </div>
          </div>
          <div>
            {hasDifferences ? (
              <Badge variant="destructive" className="gap-1.5 px-4 py-1.5 text-sm">
                <FileText className="h-4 w-4" />
                Differences Found
              </Badge>
            ) : (
              <Badge className="gap-1.5 px-4 py-1.5 text-sm bg-success hover:bg-success/90 text-success-foreground">
                <CheckCircle2 className="h-4 w-4" />
                No Differences
              </Badge>
            )}
          </div>
        </div>

        {/* Stats skipped notice (large diffs) */}
        {statsSkipped && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-xs text-muted-foreground italic">
              Stats unavailable for large diffs
            </p>
          </div>
        )}

        {/* Error Messages */}
        {(original.error || localhost.error) && (
          <div className="mt-6 pt-6 border-t space-y-3">
            {original.error && (
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-destructive/10">
                <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-destructive text-sm">Original Error</p>
                  <p className="text-sm text-destructive/80 mt-1">{original.error}</p>
                </div>
              </div>
            )}
            {localhost.error && (
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-destructive/10">
                <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-destructive text-sm">Localhost Error</p>
                  <p className="text-sm text-destructive/80 mt-1">{localhost.error}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
