import { useState, useEffect } from 'react';
import { CurlInput } from '@/components/CurlInput';
import { SummaryCard } from '@/components/SummaryCard';
import { DiffViewer, type DiffSummary } from '@/components/DiffViewer';
import { comparisonOutcome } from '@/lib/comparisonOutcome';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { TroubleshootSection } from '@/components/TroubleshootSection';
import { CorsErrorCard } from '@/components/CorsErrorCard';
import { CurlDiffLogo } from '@/components/CurlDiffLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AppTabs, AppMode } from '@/components/AppTabs';
import { TextDiffChecker } from '@/components/TextDiffChecker';
import { FeaturesSection, UsageGuideSection, FAQSection, BestPracticesSection, UseCasesSection } from '@/components/ContentSections';
import { parseCurl } from '@/lib/curlParser';
import { executeComparison, ComparisonResult } from '@/lib/requestExecutor';
import { loadProxyConfig, saveProxyConfig, type ProxyConfig } from '@/lib/proxyClient';
import { ProxySetupGuide } from '@/components/ProxySetupGuide';
import { toast } from '@/hooks/use-toast';
import { ExternalLink, ArrowRightLeft, Github, Bug, ChevronDown, ChevronUp, TerminalSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const GITHUB_REPO_URL = 'https://github.com/shubhankar-mohan/api-compare';
const GITHUB_ISSUES_URL = 'https://github.com/shubhankar-mohan/api-compare/issues';

const Index = () => {
  const [mode, setMode] = useState<AppMode>(() => {
    const saved = localStorage.getItem('diffchecker-mode');
    return (saved === 'curl-diff' || saved === 'text-diff') ? saved : 'text-diff';
  });

  useEffect(() => {
    localStorage.setItem('diffchecker-mode', mode);
  }, [mode]);
  const [showMoreSections, setShowMoreSections] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [diffSummary, setDiffSummary] = useState<DiffSummary | null>(null);
  const [proxyConfig, setProxyConfig] = useState<ProxyConfig>(() => loadProxyConfig());
  const [proxyDialogOpen, setProxyDialogOpen] = useState(false);
  // Kept so the error cards can re-run the exact same comparison — previously
  // there was no retry path at all, which left the CORS verify flow with
  // nothing to hand back to.
  const [lastInputs, setLastInputs] = useState<{ curl: string; second: string } | null>(null);

  const runComparison = async (
    curlCommand: string,
    secondInput: string,
    opts: { dropHeaders?: string[] } = {}
  ) => {
    setIsLoading(true);
    setResult(null);
    setDiffSummary(null);
    // Re-read rather than trusting state: the proxy may have just been enabled
    // from inside a dialog rendered by the error card.
    const proxy = loadProxyConfig();
    setProxyConfig(proxy);
    try {
      const parsed = parseCurl(curlCommand);
      let parsed2;
      if (secondInput.toLowerCase().includes('curl') || secondInput.toLowerCase().startsWith('http')) {
        if (secondInput.toLowerCase().includes('curl')) {
          parsed2 = parseCurl(secondInput);
        } else {
          if (!parsed.url) {
            toast({ title: 'Invalid production cURL command', description: 'Please provide a valid cURL command', variant: 'destructive' });
            return;
          }
          try {
            const prodUrl = new URL(parsed.url);
            const baseUrl = secondInput.endsWith('/') ? secondInput.slice(0, -1) : secondInput;
            const localhostUrl = `${baseUrl}${prodUrl.pathname}${prodUrl.search}`;
            let curlCmd = `curl '${localhostUrl}'`;
            if (parsed.method !== 'GET') curlCmd += ` -X ${parsed.method}`;
            for (const [key, value] of Object.entries(parsed.headers)) curlCmd += ` -H '${key}: ${value}'`;
            if (parsed.body) curlCmd += ` -d '${parsed.body}'`;
            parsed2 = parseCurl(curlCmd);
          } catch {
            toast({ title: 'Error constructing localhost URL', description: 'Failed to create localhost URL from production command', variant: 'destructive' });
            return;
          }
        }
      } else {
        parsed2 = parseCurl(secondInput);
      }
      if (!parsed.url || !parsed2.url) {
        toast({ title: 'Invalid input', description: 'Please provide valid cURL commands or URLs', variant: 'destructive' });
        return;
      }
      toast({
        title: 'Executing requests...',
        description: proxy.enabled
          ? `Comparing ${parsed.method} requests via local proxy`
          : `Comparing ${parsed.method} requests`,
      });
      const comparisonResult = await executeComparison(parsed, parsed2, {
        proxy,
        dropHeaders: opts.dropHeaders,
      });
      setResult(comparisonResult);
      setDiffSummary(null);
      toast(comparisonOutcome(comparisonResult));
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to execute comparison', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompare = (curlCommand: string, secondInput: string) => {
    setLastInputs({ curl: curlCommand, second: secondInput });
    return runComparison(curlCommand, secondInput);
  };

  const handleRetry = () => {
    if (!lastInputs) return;
    runComparison(lastInputs.curl, lastInputs.second);
  };

  const handleRetryWithoutHeaders = (headers: string[]) => {
    if (!lastInputs) return;
    toast({
      title: 'Retrying',
      description: `Dropping ${headers.join(', ')} so the preflight has less to ask for.`,
    });
    runComparison(lastInputs.curl, lastInputs.second, { dropHeaders: headers });
  };

  const toggleProxy = () => {
    if (proxyConfig.enabled) {
      const next = { ...proxyConfig, enabled: false };
      saveProxyConfig(next);
      setProxyConfig(next);
      toast({ title: 'Proxy off', description: 'Requests go directly from the browser again.' });
    } else {
      setProxyDialogOpen(true);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      {/* Organic blur shapes — MD3 atmospheric background */}
      <div className="fixed inset-0 pointer-events-none z-0" aria-hidden="true">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute top-1/3 -left-32 w-[500px] h-[500px] rounded-[100px] rounded-tr-[20px] bg-accent/8 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-secondary/20 blur-3xl" />
      </div>

      {/* Header */}
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <CurlDiffLogo className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-medium text-foreground">DiffChecker</h1>
                <p className="font-mono text-[10px] sm:text-xs tracking-[0.08em] uppercase text-muted-foreground truncate">
                  Compare <span className="text-primary font-medium">Offline</span> <span className="hidden xs:inline">&mdash; Your data stays with you</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
              <AppTabs mode={mode} onModeChange={setMode} />
              <ThemeToggle />
              <Button variant="outline" size="sm" title="Open a blank comparison in a new tab" onClick={() => window.open(window.location.href, '_blank')} className="hidden md:flex">
                <ExternalLink className="h-4 w-4 mr-1" />
                <span>New tab</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 relative z-10">
        <main>
          {/* Tool Section — full width */}
          <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
            {mode === 'curl-diff' ? (
              <>
                <CurlInput onSubmit={handleCompare} isLoading={isLoading} />

                {/* Where requests are sent from. Production APIs won't allow-list
                    this origin, so routing through a proxy on the user's own
                    machine is the only reliable way to reach them. */}
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Requests sent</span>
                  <Badge
                    variant={proxyConfig.enabled ? 'default' : 'secondary'}
                    className="font-normal gap-1"
                  >
                    <TerminalSquare className="h-3 w-3" />
                    {proxyConfig.enabled ? `via local proxy (${proxyConfig.url})` : 'directly from this browser'}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={toggleProxy}
                  >
                    {proxyConfig.enabled ? 'Turn off' : 'Use local proxy'}
                  </Button>
                  {!proxyConfig.enabled && (
                    <span className="hidden sm:inline">
                      — needed for production APIs that can't allow-list this origin
                    </span>
                  )}
                </div>

                {result && (result.original.success && result.localhost.success ? (
                  <>
                    <SummaryCard original={result.original} localhost={result.localhost} hasDifferences={diffSummary?.hasDifferences ?? null} statsSkipped={diffSummary?.statsSkipped} />
                    <ErrorBoundary label="Comparing these responses">
                      <DiffViewer original={result.original} localhost={result.localhost} onSummary={setDiffSummary} />
                    </ErrorBoundary>
                  </>
                ) : (
                  <div className="space-y-4">
                    {!result.original.success && (
                      <CorsErrorCard
                        label="Original"
                        response={result.original}
                        onRetry={handleRetry}
                        onRetryWithoutHeaders={handleRetryWithoutHeaders}
                        onSwitchToTextDiff={() => setMode('text-diff')}
                      />
                    )}
                    {!result.localhost.success && (
                      <CorsErrorCard
                        label="Localhost"
                        response={result.localhost}
                        onRetry={handleRetry}
                        onRetryWithoutHeaders={handleRetryWithoutHeaders}
                        onSwitchToTextDiff={() => setMode('text-diff')}
                      />
                    )}
                    {/* Keep the old troubleshoot section as a fallback for non-diagnosed failures */}
                    {(!result.original.diagnosis && !result.original.success) ||
                    (!result.localhost.diagnosis && !result.localhost.success) ? (
                      <TroubleshootSection original={result.original} localhost={result.localhost} />
                    ) : null}
                  </div>
                ))}
                {!result && !isLoading && (
                  <div className="text-center py-10 px-4">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-5">
                      <ArrowRightLeft className="h-7 w-7 text-primary" />
                    </div>
                    <h2 className="text-2xl font-medium mb-3">Ready to Compare</h2>
                    <p className="text-muted-foreground max-w-lg mx-auto text-base leading-relaxed">
                      Paste a cURL command above to compare API responses between environments.
                    </p>
                    <div className="mt-6 p-5 rounded-3xl bg-card shadow-sm max-w-lg mx-auto text-left">
                      <p className="font-mono text-xs font-medium uppercase tracking-[0.12em] text-primary mb-4">Supported cURL features</p>
                      <ul className="space-y-3">
                        {[
                          'GET, POST, PUT, PATCH methods (-X flag)',
                          'Custom headers (-H flag)',
                          'Request body (-d or --data flags)',
                          'Quoted and unquoted URLs',
                        ].map((item) => (
                          <li key={item} className="flex items-center gap-3 text-muted-foreground">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <TextDiffChecker />
            )}
          </div>

          {/* Content Sections */}
          <FeaturesSection />
          {showMoreSections && (
            <>
              <UsageGuideSection />
              <UseCasesSection />
              <BestPracticesSection />
              <FAQSection />
            </>
          )}
          <div className="flex justify-center py-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowMoreSections(!showMoreSections)}
              className="text-muted-foreground hover:text-primary gap-1.5"
            >
              {showMoreSections ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {showMoreSections ? 'Show less' : 'Show more — guides, tips & FAQ'}
            </Button>
          </div>
        </main>
      </div>

      <ProxySetupGuide
        open={proxyDialogOpen}
        onOpenChange={setProxyDialogOpen}
        onEnabled={() => {
          setProxyConfig(loadProxyConfig());
          handleRetry();
        }}
      />

      {/* Footer — simplified */}
      <footer className="border-t border-border/50 bg-card/50 relative z-10">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} Virtualis World. Built for developers.
            </p>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => window.open(GITHUB_REPO_URL, '_blank')} className="text-muted-foreground hover:text-primary">
                <Github className="h-4 w-4 mr-1.5" />
                Source
              </Button>
              <Button variant="ghost" size="sm" onClick={() => window.open(GITHUB_ISSUES_URL, '_blank')} className="text-muted-foreground hover:text-primary">
                <Bug className="h-4 w-4 mr-1.5" />
                Issues
              </Button>
              <Button variant="ghost" size="sm" onClick={() => window.location.href = '/privacy'} className="text-muted-foreground hover:text-primary">
                Privacy
              </Button>
              <Button variant="ghost" size="sm" onClick={() => window.location.href = '/terms'} className="text-muted-foreground hover:text-primary">
                Terms
              </Button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
export default Index;
