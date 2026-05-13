import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';
import { ErrorDiagnosis } from '@/lib/errorDiagnostics';

interface DiagnosticsPanelProps {
  diagnosis: ErrorDiagnosis;
}

export function DiagnosticsPanel({ diagnosis }: DiagnosticsPanelProps) {
  const [copied, setCopied] = useState(false);
  const { details } = diagnosis;

  const rows: Array<[string, React.ReactNode]> = [
    ['Kind', <code key="k" className="text-xs">{diagnosis.kind}</code>],
    ['URL', <code key="u" className="text-xs break-all">{details.method} {details.url}</code>],
    ['Page origin', <code key="p" className="text-xs">{details.pageOrigin || '(none)'}</code>],
    ['Target origin', <code key="t" className="text-xs">{details.targetOrigin ?? '(unparseable)'}</code>],
    ['Mixed content', details.isMixedContent ? 'yes' : 'no'],
    ['Online', details.isOnline ? 'yes' : 'no'],
    [
      'Reachable (no-cors)',
      details.reachable === null ? 'not probed' : details.reachable ? 'yes' : 'no',
    ],
    [
      'Sent headers',
      <code key="sh" className="text-xs break-all">
        {details.sentHeaders.length ? details.sentHeaders.join(', ') : '(none)'}
      </code>,
    ],
    [
      'Likely unallowed',
      details.likelyUnallowedHeaders.length ? (
        <code key="lu" className="text-xs break-all text-amber-700 dark:text-amber-500">
          {details.likelyUnallowedHeaders.join(', ')}
        </code>
      ) : (
        <span className="text-muted-foreground">(none)</span>
      ),
    ],
    ['Raw error', <code key="re" className="text-xs break-all">{details.rawError}</code>],
  ];

  const copy = async () => {
    const text = formatForClipboard(diagnosis);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API can fail under permissions / non-secure contexts; no-op.
    }
  };

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
      <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-2 text-xs">
        {rows.map(([label, value]) => (
          <ContextRow key={label} label={label}>
            {value}
          </ContextRow>
        ))}
      </div>

      {diagnosis.kind === 'cors' && details.likelyUnallowedHeaders.length > 0 && (
        <div className="rounded border border-border bg-background p-2.5 text-xs">
          <p className="font-medium mb-1">For the API owner:</p>
          <p className="text-muted-foreground">
            Add these to <code className="text-xs">Access-Control-Allow-Headers</code>:{' '}
            <code className="text-xs">{details.likelyUnallowedHeaders.join(', ')}</code>
          </p>
        </div>
      )}

      <Button size="sm" variant="outline" onClick={copy} className="h-7 text-xs">
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5 mr-1.5" />
            Copied
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Copy diagnostics
          </>
        )}
      </Button>
    </div>
  );
}

function ContextRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className="text-muted-foreground">{label}</div>
      <div>{children}</div>
    </>
  );
}

function formatForClipboard(d: ErrorDiagnosis): string {
  const { details } = d;
  return [
    `kind: ${d.kind}`,
    `url: ${details.method} ${details.url}`,
    `page origin: ${details.pageOrigin}`,
    `target origin: ${details.targetOrigin ?? '(unparseable)'}`,
    `mixed content: ${details.isMixedContent}`,
    `online: ${details.isOnline}`,
    `reachable (no-cors): ${details.reachable === null ? 'not probed' : details.reachable}`,
    `sent headers: ${details.sentHeaders.join(', ') || '(none)'}`,
    `likely unallowed: ${details.likelyUnallowedHeaders.join(', ') || '(none)'}`,
    `raw error: ${details.rawError}`,
  ].join('\n');
}
