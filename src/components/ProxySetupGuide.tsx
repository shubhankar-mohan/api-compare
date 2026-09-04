import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { CheckCircle2, XCircle, Loader2, Copy, TerminalSquare, ShieldCheck } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  checkProxyHealth,
  saveProxyConfig,
  loadProxyConfig,
  PROXY_INSTALL_COMMAND,
  PROXY_DIRECT_COMMAND,
  DEFAULT_PROXY_URL,
} from '@/lib/proxyClient';

interface ProxySetupGuideProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once the proxy is verified and enabled. */
  onEnabled?: () => void;
}

type VerifyState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'ok'; version?: string }
  | { kind: 'failed'; message: string; originRejected?: boolean };

export function ProxySetupGuide({ open, onOpenChange, onEnabled }: ProxySetupGuideProps) {
  const [url, setUrl] = useState(DEFAULT_PROXY_URL);
  const [state, setState] = useState<VerifyState>({ kind: 'idle' });

  useEffect(() => {
    if (open) {
      setUrl(loadProxyConfig().url || DEFAULT_PROXY_URL);
      setState({ kind: 'idle' });
    }
  }, [open]);

  const copyCommand = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      toast({ title: 'Copied', description: 'Paste it into your terminal.' });
    } catch {
      toast({ title: 'Copy failed', description: command, variant: 'destructive' });
    }
  };

  const verify = async () => {
    setState({ kind: 'running' });
    const health = await checkProxyHealth(url);

    if (!health.ok) {
      setState({
        kind: 'failed',
        message: health.error ?? 'No proxy answered at that address.',
        originRejected: health.originRejected,
      });
      return;
    }

    setState({ kind: 'ok', version: health.version });
    saveProxyConfig({ enabled: true, url });
    setTimeout(() => {
      onOpenChange(false);
      onEnabled?.();
    }, 900);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TerminalSquare className="h-5 w-5" />
            Reach the API through a local proxy
          </DialogTitle>
          <DialogDescription>
            A browser can't read a response the API didn't authorise, and production
            APIs won't allow-list this tool. A tiny relay on your own machine makes
            the request instead.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ol className="space-y-3 text-sm">
            <Step n={1}>
              <span>Run this in a terminal and leave it open:</span>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 rounded-md bg-muted px-3 py-2 font-mono text-xs break-all">
                  {PROXY_INSTALL_COMMAND}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyCommand(PROXY_INSTALL_COMMAND)}
                  title="Copy command"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Needs Node 18+. Nothing is installed permanently — <code>npx</code> runs it
                and forgets it.
              </p>

              {/* The proxy is one zero-dependency file, so it can be fetched and
                  run directly. Kept visible so the flow never depends on a
                  registry lookup succeeding. */}
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  npx not available, or that command failed?
                </summary>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 rounded-md bg-muted px-3 py-2 font-mono text-[11px] break-all">
                    {PROXY_DIRECT_COMMAND}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyCommand(PROXY_DIRECT_COMMAND)}
                    title="Copy command"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Downloads the single proxy file and runs it. Same program, no registry
                  involved.
                </p>
              </details>
            </Step>

            <Step n={2}>
              <span>Confirm the address it printed:</span>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={DEFAULT_PROXY_URL}
                className="mt-2 font-mono text-xs"
                spellCheck={false}
              />
            </Step>

            <Step n={3}>
              <span>Connect. Your comparison then runs through it automatically.</span>
            </Step>
          </ol>

          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <VerifyResult state={state} url={url} />
            <Button size="sm" onClick={verify} disabled={state.kind === 'running'} className="mt-3">
              {state.kind === 'running' && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {state.kind === 'ok' ? 'Connected' : state.kind === 'idle' ? 'Connect' : 'Try again'}
            </Button>
          </div>

          <div className="flex gap-2 rounded-lg border border-border/60 bg-background p-3">
            <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Your data still doesn't leave your machine.</span>{' '}
                The path is browser → <code>127.0.0.1</code> → the API. No third-party server
                is involved, and the proxy binds to loopback only, so nothing on your network
                can reach it. Close the terminal and it's gone.
              </p>
              <p>
                It also restores headers the browser refuses to send — including{' '}
                <code>Cookie</code> — so session-authenticated cURL commands work again.
              </p>
              <p>
                Safari blocks HTTPS pages from calling <code>127.0.0.1</code>. On Safari, run
                DiffChecker locally over HTTP, or use Chrome, Edge or Firefox.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <Badge
        variant="outline"
        className="h-6 w-6 rounded-full p-0 flex items-center justify-center shrink-0 font-mono"
      >
        {n}
      </Badge>
      <div className="flex-1 pt-0.5 space-y-1">{children}</div>
    </li>
  );
}

function VerifyResult({ state, url }: { state: VerifyState; url: string }) {
  if (state.kind === 'idle' || state.kind === 'running') {
    return (
      <p className="text-xs text-muted-foreground">
        Checks that a proxy is listening at <code>{url}</code> and will serve this page.
      </p>
    );
  }

  if (state.kind === 'ok') {
    return (
      <div className="flex items-start gap-2 text-sm text-emerald-600 dark:text-emerald-500">
        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          Connected{state.version ? ` to proxy v${state.version}` : ''}. Re-running your
          comparison…
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 text-sm text-destructive">
      <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
      <span>
        {state.originRejected ? (
          <>
            The proxy is running but won't serve this page. Restart it with{' '}
            <code className="text-xs">--allow-origin {typeof location !== 'undefined' ? location.origin : ''}</code>
          </>
        ) : (
          <>
            Nothing answered at <code className="text-xs">{url}</code>. Check the terminal is
            still open and the address matches what it printed.
          </>
        )}
      </span>
    </div>
  );
}
