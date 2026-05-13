import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  XCircle,
  ExternalLink,
  Loader2,
  Chrome,
} from 'lucide-react';

interface CorsInstallGuideProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  verifyUrl: string;
  verifyHeaders: string[];
  onVerified?: () => void;
}

type VerifyState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'ok' }
  | { kind: 'blocked'; reason: string }
  | { kind: 'unreachable' };

// Official Mybrowseraddon listings. These are the most popular cross-browser
// CORS-unblock builds; both ship Manifest V3 versions that handle preflight.
const CHROME_STORE_URL =
  'https://chromewebstore.google.com/detail/cors-unblock/lfhmikememgdcahcdlaciloancbhjino';
const FIREFOX_URL = 'https://addons.mozilla.org/en-US/firefox/addon/cors-unblock/';

export function CorsInstallGuide({
  open,
  onOpenChange,
  verifyUrl,
  verifyHeaders,
  onVerified,
}: CorsInstallGuideProps) {
  const [state, setState] = useState<VerifyState>({ kind: 'idle' });

  const runVerify = async () => {
    setState({ kind: 'running' });
    const result = await verifyCorsBypass(verifyUrl, verifyHeaders);
    setState(result);
    if (result.kind === 'ok' && onVerified) {
      // Give the success state a moment to register before closing.
      setTimeout(() => {
        onOpenChange(false);
        onVerified();
      }, 1200);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Chrome className="h-5 w-5" />
            Install CORS Unblock
          </DialogTitle>
          <DialogDescription>
            Lets your browser receive responses from APIs that don't whitelist
            this origin. Runs entirely in your browser — no data leaves your machine.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ol className="space-y-3 text-sm">
            <Step n={1}>
              <span>Install the extension for your browser:</span>
              <div className="flex flex-wrap gap-2 mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(CHROME_STORE_URL, '_blank', 'noopener,noreferrer')}
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Chrome / Edge / Brave
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(FIREFOX_URL, '_blank', 'noopener,noreferrer')}
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Firefox
                </Button>
              </div>
            </Step>
            <Step n={2}>
              Pin the extension icon to your toolbar so you can see its state.
            </Step>
            <Step n={3}>
              <span>
                Click the icon and toggle it <strong>ON</strong> for this tab.
                Most CORS extensions are off by default.
              </span>
            </Step>
            <Step n={4}>
              <span>Reload this page (the failed preflight may be cached).</span>
            </Step>
          </ol>

          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-sm font-medium mb-2">Verify it's working</p>
            <p className="text-xs text-muted-foreground mb-3">
              Sends a test request to your URL with the same headers as the failed
              one, to confirm the extension is unblocking this specific preflight.
            </p>
            <VerifyResult state={state} />
            <Button
              size="sm"
              onClick={runVerify}
              disabled={state.kind === 'running'}
              className="mt-3"
            >
              {state.kind === 'running' && (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              )}
              {state.kind === 'idle' && 'Verify now'}
              {state.kind === 'running' && 'Verifying…'}
              {(state.kind === 'ok' || state.kind === 'blocked' || state.kind === 'unreachable') &&
                'Retry verify'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <Badge variant="outline" className="h-6 w-6 rounded-full p-0 flex items-center justify-center shrink-0 font-mono">
        {n}
      </Badge>
      <div className="flex-1 pt-0.5 space-y-1">{children}</div>
    </li>
  );
}

function VerifyResult({ state }: { state: VerifyState }) {
  if (state.kind === 'idle') return null;
  if (state.kind === 'running') return null;
  if (state.kind === 'ok') {
    return (
      <div className="flex items-start gap-2 text-sm text-emerald-600 dark:text-emerald-500">
        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
        <span>Working. The extension is unblocking this request. Closing…</span>
      </div>
    );
  }
  if (state.kind === 'unreachable') {
    return (
      <div className="flex items-start gap-2 text-sm text-destructive">
        <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          The server didn't respond at all. This isn't a CORS problem — check the
          URL, DNS, or whether the server is up.
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 text-sm text-destructive">
      <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
      <span>
        Still blocked. {state.reason} Common causes: the extension icon isn't
        toggled on for this tab, the extension doesn't rewrite preflight (OPTIONS)
        responses, or your preflight is cached — try a hard reload.
      </span>
    </div>
  );
}

/**
 * Re-sends the failing request with the same method + custom headers so the browser
 * issues the same preflight. If the extension is active and handles preflight, we
 * get any response (even 4xx/5xx) and resolve. If CORS still blocks, fetch rejects.
 * A no-cors probe distinguishes "extension didn't help" from "server is now down."
 */
async function verifyCorsBypass(
  url: string,
  sentHeaderNames: string[],
): Promise<VerifyState> {
  const probeHeaders: Record<string, string> = {};
  // Dummy values are fine — preflight only checks header names.
  sentHeaderNames.forEach((name) => {
    probeHeaders[name] = 'cors-verify-probe';
  });

  try {
    await fetch(url, {
      method: 'GET',
      mode: 'cors',
      headers: probeHeaders,
      cache: 'no-store',
    });
    return { kind: 'ok' };
  } catch (err) {
    // Distinguish "CORS still failing" from "server unreachable" via a no-cors probe.
    try {
      await fetch(url, {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-store',
      });
      return {
        kind: 'blocked',
        reason: err instanceof Error ? err.message : 'CORS rejection.',
      };
    } catch {
      return { kind: 'unreachable' };
    }
  }
}
