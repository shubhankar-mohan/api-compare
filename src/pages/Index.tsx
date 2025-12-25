import { useState } from 'react';
import { CurlInput } from '@/components/CurlInput';
import { SummaryCard } from '@/components/SummaryCard';
import { DiffViewer } from '@/components/DiffViewer';
import { TroubleshootSection } from '@/components/TroubleshootSection';
import { CurlDiffLogo } from '@/components/CurlDiffLogo';
import { parseCurl } from '@/lib/curlParser';
import { executeComparison, ComparisonResult } from '@/lib/requestExecutor';
import { computeDiff, formatJson } from '@/lib/diffAlgorithm';
import { toast } from '@/hooks/use-toast';
import { ExternalLink, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

const Index = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ComparisonResult | null>(null);

  const handleCompare = async (curlCommand: string, localhostUrl: string) => {
    setIsLoading(true);
    setResult(null);

    try {
      const parsed = parseCurl(curlCommand);
      
      if (!parsed.url) {
        toast({
          title: 'Invalid cURL',
          description: 'Could not extract URL from the cURL command',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Executing requests...',
        description: `Comparing ${parsed.method} requests`,
      });

      const comparisonResult = await executeComparison(parsed, localhostUrl);
      setResult(comparisonResult);

      const hasDiff = comparisonResult.original.body !== comparisonResult.localhost.body ||
                      comparisonResult.original.status !== comparisonResult.localhost.status;

      toast({
        title: 'Comparison complete',
        description: hasDiff ? 'Differences found between responses' : 'Responses are identical',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to execute comparison',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const bodyDiff = result ? computeDiff(
    formatJson(result.original.body),
    formatJson(result.localhost.body)
  ) : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CurlDiffLogo className="h-10 w-10" />
              <div>
                <h1 className="text-xl font-semibold">CurlDiff</h1>
                <p className="text-sm text-muted-foreground">
                  Compare API responses between production and localhost
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(window.location.href, '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Open in new tab</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6 flex-1 w-full">
        {/* Input Section */}
        <CurlInput onSubmit={handleCompare} isLoading={isLoading} />

        {/* Results Section */}
        {result && (
          result.original.success && result.localhost.success ? (
            <>
              <SummaryCard 
                original={result.original} 
                localhost={result.localhost}
                hasDifferences={bodyDiff?.hasDifferences ?? false}
              />
              <DiffViewer 
                original={result.original} 
                localhost={result.localhost} 
              />
            </>
          ) : (
            <TroubleshootSection original={result.original} localhost={result.localhost} />
          )
        )}
        {!result && !isLoading && (
          <div className="text-center py-16 px-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <ArrowRightLeft className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-medium mb-2">Ready to Compare</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Paste a cURL command above to compare the API response between your production 
              server and local development environment.
            </p>
            <div className="mt-6 p-4 rounded-lg bg-card border max-w-lg mx-auto text-left">
              <p className="text-sm font-medium mb-2">Supported cURL features:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• GET, POST, PUT, PATCH methods (-X flag)</li>
                <li>• Custom headers (-H flag)</li>
                <li>• Request body (-d or --data flags)</li>
                <li>• Quoted and unquoted URLs</li>
              </ul>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t bg-background">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <p className="text-sm text-muted-foreground text-center">
            Built for developers who need to validate local API implementations
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
