import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  AlertTriangle,
  Chrome,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Lock,
  RefreshCw,
  WifiOff,
  Server,
  Link2Off,
  Clock,
  HelpCircle,
} from 'lucide-react';
import { ApiResponse } from '@/lib/requestExecutor';
import { ErrorKind } from '@/lib/errorDiagnostics';
import { CorsInstallGuide } from './CorsInstallGuide';
import { DiagnosticsPanel } from './DiagnosticsPanel';

interface CorsErrorCardProps {
  label: string;
  response: ApiResponse;
  onRetry?: () => void;
  onSwitchToTextDiff?: () => void;
}

type LeadIcon = typeof AlertTriangle;

const iconForKind: Record<ErrorKind, LeadIcon> = {
  cors: Lock,
  'mixed-content': Lock,
  offline: WifiOff,
  unreachable: Server,
  'bad-url': Link2Off,
  timeout: Clock,
  unknown: HelpCircle,
};

const titleForKind: Record<ErrorKind, string> = {
  cors: 'CORS Blocked',
  'mixed-content': 'Mixed Content Blocked',
  offline: 'No Internet Connection',
  unreachable: 'Server Unreachable',
  'bad-url': 'Invalid URL',
  timeout: 'Request Timed Out',
  unknown: 'Request Failed',
};

export function CorsErrorCard({
  label,
  response,
  onRetry,
  onSwitchToTextDiff,
}: CorsErrorCardProps) {
  const [installOpen, setInstallOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const diagnosis = response.diagnosis;
  const kind: ErrorKind = diagnosis?.kind ?? 'unknown';
  const Icon = iconForKind[kind];

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-5 w-5 text-destructive" />
          <span>{titleForKind[kind]}</span>
          <Badge variant="outline" className="ml-1 font-normal text-xs">
            {label}
          </Badge>
        </CardTitle>
        <code className="text-xs text-muted-foreground break-all block mt-1">
          {response.url}
        </code>
      </CardHeader>
      <CardContent className="space-y-4">
        <ErrorBody
          kind={kind}
          diagnosis={diagnosis}
          rawError={response.error}
          onInstall={() => setInstallOpen(true)}
          onRetry={onRetry}
          onSwitchToTextDiff={onSwitchToTextDiff}
        />

        {diagnosis && (
          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <CollapsibleTrigger asChild>
              <button
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                type="button"
              >
                {detailsOpen ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                Show technical details
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              <DiagnosticsPanel diagnosis={diagnosis} />
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>

      <CorsInstallGuide
        open={installOpen}
        onOpenChange={setInstallOpen}
        verifyUrl={response.url}
        verifyHeaders={diagnosis?.details.sentHeaders ?? []}
        onVerified={onRetry}
      />
    </Card>
  );
}

interface ErrorBodyProps {
  kind: ErrorKind;
  diagnosis?: ApiResponse['diagnosis'];
  rawError?: string;
  onInstall: () => void;
  onRetry?: () => void;
  onSwitchToTextDiff?: () => void;
}

function ErrorBody({
  kind,
  diagnosis,
  rawError,
  onInstall,
  onRetry,
  onSwitchToTextDiff,
}: ErrorBodyProps) {
  switch (kind) {
    case 'cors':
      return <CorsBody diagnosis={diagnosis} onInstall={onInstall} onSwitchToTextDiff={onSwitchToTextDiff} />;
    case 'mixed-content':
      return <MixedContentBody url={diagnosis?.details.url ?? ''} />;
    case 'offline':
      return <OfflineBody onRetry={onRetry} />;
    case 'unreachable':
      return <UnreachableBody url={diagnosis?.details.url ?? ''} onSwitchToTextDiff={onSwitchToTextDiff} />;
    case 'bad-url':
      return <BadUrlBody url={diagnosis?.details.url ?? ''} />;
    case 'timeout':
      return <TimeoutBody onRetry={onRetry} />;
    default:
      return <UnknownBody rawError={rawError} onSwitchToTextDiff={onSwitchToTextDiff} />;
  }
}

function CorsBody({
  diagnosis,
  onInstall,
  onSwitchToTextDiff,
}: {
  diagnosis?: ApiResponse['diagnosis'];
  onInstall: () => void;
  onSwitchToTextDiff?: () => void;
}) {
  const suspects = diagnosis?.details.likelyUnallowedHeaders ?? [];
  return (
    <div className="space-y-3">
      <p className="text-sm">
        The server responded, but the browser blocked the response under CORS.
        This usually means one of two things:
      </p>
      <ul className="text-sm space-y-1.5 ml-1">
        <li className="flex gap-2">
          <span className="text-muted-foreground">·</span>
          <span>
            Your origin (<code className="text-xs">{diagnosis?.details.pageOrigin}</code>) isn't on the
            server's <code className="text-xs">Access-Control-Allow-Origin</code> list.
          </span>
        </li>
        {suspects.length > 0 && (
          <li className="flex gap-2">
            <span className="text-muted-foreground">·</span>
            <span>
              One of your headers isn't on the server's allow-list. Most likely:{' '}
              {suspects.map((h, i) => (
                <span key={h}>
                  <code className="text-xs">{h}</code>
                  {i < suspects.length - 1 ? ', ' : ''}
                </span>
              ))}
            </span>
          </li>
        )}
      </ul>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" onClick={onInstall}>
          <Chrome className="h-4 w-4 mr-1.5" />
          Install CORS Unblock
        </Button>
        {onSwitchToTextDiff && (
          <Button size="sm" variant="outline" onClick={onSwitchToTextDiff}>
            <FileText className="h-4 w-4 mr-1.5" />
            Paste responses in Text Diff
          </Button>
        )}
      </div>
    </div>
  );
}

function MixedContentBody({ url }: { url: string }) {
  return (
    <div className="space-y-3">
      <p className="text-sm">
        This page is served over HTTPS but the target URL is HTTP. Browsers block
        this combination for security.
      </p>
      <ul className="text-sm space-y-1.5 ml-1">
        <li className="flex gap-2">
          <span className="text-muted-foreground">·</span>
          <span>Use HTTPS for the target server (recommended)</span>
        </li>
        <li className="flex gap-2">
          <span className="text-muted-foreground">·</span>
          <span>Or open this tool over HTTP locally</span>
        </li>
      </ul>
      {url && (
        <code className="text-xs text-muted-foreground block break-all">{url}</code>
      )}
    </div>
  );
}

function OfflineBody({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm">Your device is offline. Reconnect and try again.</p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="h-4 w-4 mr-1.5" />
          Retry
        </Button>
      )}
    </div>
  );
}

function UnreachableBody({
  url,
  onSwitchToTextDiff,
}: {
  url: string;
  onSwitchToTextDiff?: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm">
        The server didn't respond at all. Possible causes:
      </p>
      <ul className="text-sm space-y-1.5 ml-1">
        <li className="flex gap-2">
          <span className="text-muted-foreground">·</span>
          <span>DNS can't resolve the hostname</span>
        </li>
        <li className="flex gap-2">
          <span className="text-muted-foreground">·</span>
          <span>TLS certificate is invalid or self-signed</span>
        </li>
        <li className="flex gap-2">
          <span className="text-muted-foreground">·</span>
          <span>Server is down or firewalled</span>
        </li>
      </ul>
      <div className="flex flex-wrap gap-2 pt-1">
        {url && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink className="h-4 w-4 mr-1.5" />
            Try in new tab
          </Button>
        )}
        {onSwitchToTextDiff && (
          <Button size="sm" variant="outline" onClick={onSwitchToTextDiff}>
            <FileText className="h-4 w-4 mr-1.5" />
            Paste responses in Text Diff
          </Button>
        )}
      </div>
    </div>
  );
}

function BadUrlBody({ url }: { url: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm">The URL couldn't be parsed.</p>
      {url && (
        <code className="text-xs text-muted-foreground block break-all">{url}</code>
      )}
      <p className="text-xs text-muted-foreground">
        Check for missing scheme (https://), typos, or unescaped characters.
      </p>
    </div>
  );
}

function TimeoutBody({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm">
        The server took too long to respond and the request was cancelled.
      </p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="h-4 w-4 mr-1.5" />
          Retry
        </Button>
      )}
    </div>
  );
}

function UnknownBody({
  rawError,
  onSwitchToTextDiff,
}: {
  rawError?: string;
  onSwitchToTextDiff?: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm">The request failed for an unknown reason.</p>
      {rawError && (
        <code className="text-xs text-destructive block break-all bg-destructive/5 p-2 rounded">
          {rawError}
        </code>
      )}
      {onSwitchToTextDiff && (
        <Button size="sm" variant="outline" onClick={onSwitchToTextDiff}>
          <FileText className="h-4 w-4 mr-1.5" />
          Paste responses in Text Diff
        </Button>
      )}
    </div>
  );
}
