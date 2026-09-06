import type { ComparisonResult } from './requestExecutor';

export interface ComparisonOutcome {
  title: string;
  description: string;
  variant?: 'destructive';
}

/**
 * What to tell the user the moment both requests have settled.
 *
 * This deliberately says nothing about whether the bodies differ. The page
 * used to compare the raw body strings here, so two failed requests (both
 * with an empty body) toasted "Responses are identical", one failure toasted
 * "Differences found", and a key-order-only difference contradicted the
 * summary badge. The verdict belongs to the diff on screen; this only reports
 * what the requests themselves established.
 */
export function comparisonOutcome(result: ComparisonResult): ComparisonOutcome {
  const { original, localhost } = result;
  const reason = (r: typeof original) => (r.error || `HTTP ${r.status || 'error'}`).replace(/[.\s]+$/, '');

  if (!original.success && !localhost.success) {
    return {
      title: 'Both requests failed',
      description: `Original: ${reason(original)}. Localhost: ${reason(localhost)}.`,
      variant: 'destructive',
    };
  }
  if (!original.success || !localhost.success) {
    const side = original.success ? 'Localhost' : 'Original';
    const failed = original.success ? localhost : original;
    return {
      title: 'One request failed',
      description: `${side} request failed: ${reason(failed)}. Nothing to compare until it succeeds.`,
      variant: 'destructive',
    };
  }
  if (original.status !== localhost.status) {
    return {
      title: 'Comparison complete',
      description: `Status codes differ: ${original.status} vs ${localhost.status}. See the diff below.`,
    };
  }
  return {
    title: 'Comparison complete',
    description: 'Both responses received. The verdict is in the summary below.',
  };
}
