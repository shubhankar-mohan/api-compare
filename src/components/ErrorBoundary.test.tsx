import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';
import { DiffDepthExceededError } from '@/lib/jsonTreeDiff';

function Thrower({ error }: { error: Error }) {
  throw error;
}

describe('ErrorBoundary', () => {
  it('explains a rejected input without calling it a bug', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <ErrorBoundary label="Comparing these responses">
        <Thrower error={new DiffDepthExceededError(300)} />
      </ErrorBoundary>
    );
    expect(container.textContent).toMatch(/too deep/i);
    expect(container.textContent).not.toMatch(/bug in DiffChecker/i);
  });

  it('still treats an unknown error as a bug', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <ErrorBoundary>
        <Thrower error={new Error('boom')} />
      </ErrorBoundary>
    );
    expect(container.textContent).toMatch(/bug in DiffChecker/i);
    expect(container.textContent).toContain('boom');
  });
});
