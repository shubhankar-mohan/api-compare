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
  TerminalSquare,
  PlugZap,
  Cookie,
} from 'lucide-react';
import { ApiResponse } from '@/lib/requestExecutor';
import { ErrorKind, unreachableHints } from '@/lib/errorDiagnostics';
import { CorsInstallGuide } from './CorsInstallGuide';
import { ProxySetupGuide } from './ProxySetupGuide';
import { DiagnosticsPanel } from './DiagnosticsPanel';

interface CorsErrorCardProps {
  label: string;
  response: ApiResponse;
  onRetry?: () => void;
  onRetryWithoutHeaders?: (headers: string[]) => void;
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
  'proxy-unreachable': PlugZap,
  unknown: HelpCircle,
};

const titleForKind: Record<ErrorKind, string> = {
  cors: 'CORS Blocked',
  'mixed-content': 'Mixed Content Blocked',
  offline: 'No Internet Connection',
  unreachable: 'Server Unreachable',
  'bad-url': 'Invalid URL',
  timeout: 'Request Timed Out',
  'proxy-unreachable': 'Local Proxy Not Responding',
  unknown: 'Request Failed',
};

export function CorsErrorCard({
  label,
  response,
  onRetry,
  onRetryWithoutHeaders,
  onSwitchToTextDiff,
}: CorsErrorCardProps) {
  const [installOpen, setInstallOpen] = useState(false);
  const [proxyOpen, setProxyOpen] = useState(false);
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
          {response.viaProxy && (
            <Badge variant="secondary" className="font-normal text-xs">
              via proxy
            </Badge>
          )}
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
          onSetUpProxy={() => setProxyOpen(true)}
          onRetry={onRetry}
          onRetryWithoutHeaders={onRetryWithoutHeaders}
          onSwitchToTextDiff={onSwitchToTextDiff}
        />

        <StrippedCredentialsNotice
          diagnosis={diagnosis}
          onSetUpProxy={() => setProxyOpen(true)}
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

      <ProxySetupGuide open={proxyOpen} onOpenChange={setProxyOpen} onEnabled={onRetry} />

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

/**
 * The browser silently drops `Cookie` from any fetch. The cURL parser reads
 * `-b/--cookie` faithfully, so a user who pasted an authenticated command gets
 * an anonymous request and an unexplained 401. Say so, and point at the fix.
 */
function StrippedCredentialsNotice({
  diagnosis,
  onSetUpProxy,
}: {
  diagnosis?: ApiResponse['diagnosis'];
  onSetUpProxy: () => void;
}) {
  const stripped = diagnosis?.details.strippedAuthHeaders ?? [];
  if (stripped.length === 0) return null;

  return (
    <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
      <Cookie className="h-4 w-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-500" />
      <div className="space-y-1.5 text-xs">
        <p>
          <span className="font-medium">
            Your {stripped.join(' and ')} header was not sent.
          </span>{' '}
          Browsers forbid scripts from setting it, so this request went out
          unauthenticated — which is often the real reason it failed.
        </p>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onSetUpProxy}>
          <TerminalSquare className="h-3.5 w-3.5 mr-1.5" />
          Send it through the local proxy
        </Button>
      </div>
    </div>
  );
}

interface ErrorBodyProps {
  kind: ErrorKind;
  diagnosis?: ApiResponse['diagnosis'];
  rawError?: string;
  onInstall: () => void;
  onSetUpProxy: () => void;
  onRetry?: () => void;
  onRetryWithoutHeaders?: (headers: string[]) => void;
  onSwitchToTextDiff?: () => void;
}

function ErrorBody({
  kind,
  diagnosis,
  rawError,
  onInstall,
  onSetUpProxy,
  onRetry,
  onRetryWithoutHeaders,
  onSwitchToTextDiff,
}: ErrorBodyProps) {
  switch (kind) {
    case 'cors':
      return (
        <CorsBody
          diagnosis={diagnosis}
          onInstall={onInstall}
          onSetUpProxy={onSetUpProxy}
          onRetryWithoutHeaders={onRetryWithoutHeaders}
          onSwitchToTextDiff={onSwitchToTextDiff}
        />
      );
    case 'mixed-content':
      return <MixedContentBody url={diagnosis?.details.url ?? ''} onSetUpProxy={onSetUpProxy} />;
    case 'offline':
      return <OfflineBody onRetry={onRetry} />;
    case 'unreachable':
      return (
        <UnreachableBody
          url={diagnosis?.details.url ?? ''}
          targetOrigin={diagnosis?.details.targetOrigin ?? null}
          viaProxy={diagnosis?.details.viaProxy ?? false}
          rawError={rawError}
          onSwitchToTextDiff={onSwitchToTextDiff}
        />
      );
    case 'bad-url':
      return <BadUrlBody url={diagnosis?.details.url ?? ''} />;
    case 'timeout':
      return <TimeoutBody onRetry={onRetry} />;
    case 'proxy-unreachable':
      return <ProxyUnreachableBody rawError={rawError} onSetUpProxy={onSetUpProxy} onRetry={onRetry} />;
    default:
      return <UnknownBody rawError={rawError} onSwitchToTextDiff={onSwitchToTextDiff} />;
  }
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="text-muted-foreground">·</span>
      <span>{children}</span>
    </li>
  );
}

/**
 * The CORS body is ordered by what actually works, cheapest first:
 *
 *  1. Drop the headers that tripped the preflight — one click, no setup, and we
 *     already know which ones are suspect.
 *  2. Run the local proxy — the only thing that reliably works against a
 *     production API you don't control, and it keeps data on the user's machine.
 *  3. Paste into Text Diff — always available.
 *  4. A CORS-disabling extension — last, because it turns the protection off
 *     for every site in the profile, not just this one.
 */
function CorsBody({
  diagnosis,
  onInstall,
  onSetUpProxy,
  onRetryWithoutHeaders,
  onSwitchToTextDiff,
}: {
  diagnosis?: ApiResponse['diagnosis'];
  onInstall: () => void;
  onSetUpProxy: () => void;
  onRetryWithoutHeaders?: (headers: string[]) => void;
  onSwitchToTextDiff?: () => void;
}) {
  const suspects = diagnosis?.details.likelyUnallowedHeaders ?? [];
  const proxyRunning = diagnosis?.details.proxyRunning === true;

  return (
    <div className="space-y-3">
      <p className="text-sm">
        The server responded, but the browser blocked the response under CORS. Nothing
        the page does can override that — the fix has to come from the server, or the
        request has to be made from outside the browser.
      </p>
      <ul className="text-sm space-y-1.5 ml-1">
        <Bullet>
          Your origin (<code className="text-xs">{diagnosis?.details.pageOrigin}</code>) isn't on
          the server's <code className="text-xs">Access-Control-Allow-Origin</code> list.
        </Bullet>
        {suspects.length > 0 && (
          <Bullet>
            Or one of your headers isn't allow-listed. Most likely:{' '}
            {suspects.map((h, i) => (
              <span key={h}>
                <code className="text-xs">{h}</code>
                {i < suspects.length - 1 ? ', ' : ''}
              </span>
            ))}
          </Bullet>
        )}
      </ul>

      <div className="flex flex-wrap gap-2 pt-1">
        {suspects.length > 0 && onRetryWithoutHeaders && (
          <Button size="sm" onClick={() => onRetryWithoutHeaders(suspects)}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Retry without {suspects.length === 1 ? `“${suspects[0]}”` : `those ${suspects.length} headers`}
          </Button>
        )}
        <Button size="sm" variant={suspects.length > 0 ? 'outline' : 'default'} onClick={onSetUpProxy}>
          <TerminalSquare className="h-4 w-4 mr-1.5" />
          {proxyRunning ? 'Use the proxy that’s already running' : 'Run the local proxy'}
        </Button>
        {onSwitchToTextDiff && (
          <Button size="sm" variant="outline" onClick={onSwitchToTextDiff}>
            <FileText className="h-4 w-4 mr-1.5" />
            Paste responses in Text Diff
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {proxyRunning
          ? 'A proxy is already listening on this machine — connecting takes one click.'
          : 'The proxy is one npx command and keeps every request on your own machine.'}{' '}
        <button
          type="button"
          onClick={onInstall}
          className="underline underline-offset-2 hover:text-foreground"
        >
          A browser extension can also do it
        </button>
        , but it disables CORS for every site in that profile, so reach for it last.
      </p>
    </div>
  );
}

function MixedContentBody({ url, onSetUpProxy }: { url: string; onSetUpProxy: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm">
        This page is served over HTTPS but the target URL is HTTP. Browsers block that
        combination.
      </p>
      <ul className="text-sm space-y-1.5 ml-1">
        <Bullet>Use HTTPS for the target server (recommended)</Bullet>
        <Bullet>Or run the local proxy — it fetches the HTTP URL for you</Bullet>
        <Bullet>Or open this tool over HTTP locally</Bullet>
      </ul>
      <Button size="sm" onClick={onSetUpProxy}>
        <TerminalSquare className="h-4 w-4 mr-1.5" />
        Run the local proxy
      </Button>
      {url && <code className="text-xs text-muted-foreground block break-all">{url}</code>}
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
  targetOrigin,
  viaProxy,
  rawError,
  onSwitchToTextDiff,
}: {
  url: string;
  targetOrigin: string | null;
  viaProxy: boolean;
  rawError?: string;
  onSwitchToTextDiff?: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm">The server didn't respond.</p>
      {viaProxy && rawError ? (
        // Through the proxy we have the actual OS-level cause rather than the
        // browser's opaque "Failed to fetch".
        <code className="text-xs text-destructive block break-all bg-destructive/5 p-2 rounded">
          {rawError}
        </code>
      ) : (
        <ul className="text-sm space-y-1.5 ml-1">
          {unreachableHints(targetOrigin).map((hint) => (
            <Bullet key={hint}>{hint}</Bullet>
          ))}
        </ul>
      )}
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

function ProxyUnreachableBody({
  rawError,
  onSetUpProxy,
  onRetry,
}: {
  rawError?: string;
  onSetUpProxy: () => void;
  onRetry?: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm">
        Proxy routing is switched on, but nothing answered. The terminal running it has
        probably been closed.
      </p>
      {rawError && (
        <code className="text-xs text-destructive block break-all bg-destructive/5 p-2 rounded">
          {rawError}
        </code>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onSetUpProxy}>
          <TerminalSquare className="h-4 w-4 mr-1.5" />
          Restart it
        </Button>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Retry
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
      {url && <code className="text-xs text-muted-foreground block break-all">{url}</code>}
      <p className="text-xs text-muted-foreground">
        Check for a missing scheme (https://), typos, or unescaped characters.
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
