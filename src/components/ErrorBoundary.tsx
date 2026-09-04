import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  /** Optional label so the message can name what failed. */
  label?: string;
}

interface State {
  error: Error | null;
}

/**
 * Last-resort guard around the render tree.
 *
 * The diff engine runs synchronously inside a `useMemo` during render, so
 * anything it throws is a render error. Without a boundary React unmounts the
 * whole tree and the user gets a blank white page with no explanation — which
 * is exactly what a pathologically nested response used to produce.
 *
 * This is a backstop, not the primary handling: known failures (such as
 * `DiffDepthExceededError`) are caught where they happen and explained in
 * place. Anything that reaches here is a bug, so it shows the message and
 * offers a way out rather than pretending to recover.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No telemetry — this app sends nothing anywhere. The console is the only
    // place a user or contributor can inspect what happened.
    console.error('[DiffChecker] Unhandled render error:', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="mx-auto my-8 max-w-2xl rounded-lg border border-destructive/50 bg-destructive/5 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <h2 className="text-base font-medium">
                {this.props.label ? `${this.props.label} failed` : 'Something went wrong'}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                This is a bug in DiffChecker, not in your data. Your responses were not sent
                anywhere.
              </p>
            </div>

            <code className="block max-h-40 overflow-auto break-all rounded bg-background p-2 text-xs text-destructive">
              {error.message || String(error)}
            </code>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={this.reset}>
                <RefreshCw className="mr-1.5 h-4 w-4" />
                Try again
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  window.open(
                    'https://github.com/shubhankar-mohan/api-compare/issues/new',
                    '_blank',
                    'noopener,noreferrer'
                  )
                }
              >
                Report it
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
