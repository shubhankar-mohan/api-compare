import { useState, useEffect } from 'react';
import { CurlInput } from '@/components/CurlInput';
import { SummaryCard } from '@/components/SummaryCard';
import { DiffViewer } from '@/components/DiffViewer';
import { TroubleshootSection } from '@/components/TroubleshootSection';
import { CurlDiffLogo } from '@/components/CurlDiffLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AppTabs, AppMode } from '@/components/AppTabs';
import { TextDiffChecker } from '@/components/TextDiffChecker';
import { AdBanner } from '@/components/AdBanner';
import { FeaturesSection, UsageGuideSection, FAQSection, BestPracticesSection, UseCasesSection } from '@/components/ContentSections';
import { parseCurl } from '@/lib/curlParser';
import { executeComparison, ComparisonResult } from '@/lib/requestExecutor';
import { computeDiff, formatJson } from '@/lib/diffAlgorithm';
import { toast } from '@/hooks/use-toast';
import { ExternalLink, ArrowRightLeft, Sparkles, Github, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const handleCompare = async (curlCommand: string, localhostUrl: string) => {
    setIsLoading(true);
    setResult(null);
    try {
      const parsed = parseCurl(curlCommand);
      const parsed2 = parseCurl(localhostUrl);
      // console.log(parsed.url +" " + parsed2.url)
      if (!parsed.url || !parsed2.url) {
        toast({
          title: 'Invalid cURL command - A or B or both',
          description: '',
          variant: 'destructive'
        });
        return;
      }
      toast({
        title: 'Executing requests...',
        description: `Comparing ${parsed.method} requests`
      });
      const comparisonResult = await executeComparison(parsed, parsed2);
      setResult(comparisonResult);
      const hasDiff = comparisonResult.original.body !== comparisonResult.localhost.body || comparisonResult.original.status !== comparisonResult.localhost.status;
      toast({
        title: 'Comparison complete',
        description: hasDiff ? 'Differences found between responses' : 'Responses are identical'
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to execute comparison',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };
  const bodyDiff = result ? computeDiff(formatJson(result.original.body), formatJson(result.localhost.body)) : null;
  return <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CurlDiffLogo className="h-10 w-10" />
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">DiffChecker</h1>
                <p className="text-sm text-muted-foreground">
                  Compare <span className="font-bold">Offline</span>  - Your data stays with you
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <AppTabs mode={mode} onModeChange={setMode} />
              <ThemeToggle />
              <Button variant="outline" size="sm" onClick={() => window.open(window.location.href, '_blank')} className="shadow-sm hover:shadow-md transition-shadow hidden sm:flex">
                <ExternalLink className="h-4 w-4 mr-1" />
                <span>Open in new tab</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1">
        <main className="space-y-0">
          {/* Tool Section */}
          <div className="px-3 py-6 max-w-6xl mx-auto space-y-8">
            {mode === 'curl-diff' ? <>
                {/* Input Section */}
                <CurlInput onSubmit={handleCompare} isLoading={isLoading} />

                {/* Results Section */}
                {result && (result.original.success && result.localhost.success ? <>
                      <SummaryCard original={result.original} localhost={result.localhost} hasDifferences={bodyDiff?.hasDifferences ?? false} />
                      <DiffViewer original={result.original} localhost={result.localhost} />
                    </> : <TroubleshootSection original={result.original} localhost={result.localhost} />)}
                {!result && !isLoading && <div className="text-center py-20 px-4">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 mb-6 shadow-lg">
                      <ArrowRightLeft className="h-10 w-10 text-primary" />
                    </div>
                    <h2 className="text-2xl font-bold mb-3 bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">Ready to Compare</h2>
                    <p className="text-muted-foreground max-w-md mx-auto text-lg">
                      Paste a cURL command above to compare the API response between your production 
                      server and local development environment.
                    </p>
                    <div className="mt-8 p-6 rounded-2xl bg-card border shadow-lg max-w-lg mx-auto text-left">
                      <div className="flex items-center gap-2 mb-4">
                        <Sparkles className="h-5 w-5 text-accent" />
                        <p className="font-semibold">Supported cURL features:</p>
                      </div>
                      <ul className="space-y-2">
                        <li className="flex items-center gap-2 text-muted-foreground">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                          GET, POST, PUT, PATCH methods (-X flag)
                        </li>
                        <li className="flex items-center gap-2 text-muted-foreground">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                          Custom headers (-H flag)
                        </li>
                        <li className="flex items-center gap-2 text-muted-foreground">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                          Request body (-d or --data flags)
                        </li>
                        <li className="flex items-center gap-2 text-muted-foreground">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                          Quoted and unquoted URLs
                        </li>
                      </ul>
                    </div>
                  </div>}
              </> : <TextDiffChecker />}
          </div>

          {/* Features Section */}
          <FeaturesSection />
          
          {/* Ad Banner */}
          <div className="w-full px-4 py-6 bg-muted/30">
            <div className="max-w-4xl mx-auto">
              <AdBanner adSlot="1234567890" format="horizontal" />
            </div>
          </div>

          {/* Usage Guide Section */}
          <UsageGuideSection />
          
          {/* Use Cases Section */}
          <UseCasesSection />
          
          {/* Ad Banner */}
          <div className="w-full px-4 py-6">
            <div className="max-w-4xl mx-auto">
              <AdBanner adSlot="9876543210" format="horizontal" />
            </div>
          </div>

          {/* Best Practices Section */}
          <BestPracticesSection />
          
          {/* FAQ Section */}
          <FAQSection />
          
          {/* Bottom Ad Banner */}
          <div className="w-full px-4 py-6 bg-muted/30">
            <div className="max-w-4xl mx-auto">
              <AdBanner adSlot="5555555555" format="horizontal" />
            </div>
          </div>
        </main>
      </div>


      {/* Footer */}
      <footer className="border-t bg-card/50">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div>
              <h3 className="font-semibold text-sm mb-3">About DiffChecker</h3>
              <p className="text-sm text-muted-foreground">
                A privacy-first, browser-based tool for comparing API responses and text content. 
                All processing happens locally in your browser.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-3">Resources</h3>
              <div className="flex flex-col gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(GITHUB_REPO_URL, '_blank')}
                  className="text-muted-foreground hover:text-foreground justify-start px-0"
                >
                  <Github className="h-4 w-4 mr-2" />
                  Source Code
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(GITHUB_ISSUES_URL, '_blank')}
                  className="text-muted-foreground hover:text-foreground justify-start px-0"
                >
                  <Bug className="h-4 w-4 mr-2" />
                  Report Issue
                </Button>
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-3">Legal</h3>
              <div className="flex flex-col gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.location.href = '/privacy'}
                  className="text-muted-foreground hover:text-foreground justify-start px-0"
                >
                  Privacy Policy
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.location.href = '/terms'}
                  className="text-muted-foreground hover:text-foreground justify-start px-0"
                >
                  Terms of Service
                </Button>
              </div>
            </div>
          </div>
          <div className="border-t pt-6">
            <p className="text-sm text-muted-foreground text-center">
              © 2024 Virtualis World. Created with ❤️ for developers worldwide.
            </p>
          </div>
        </div>
      </footer>
    </div>;
};
export default Index;