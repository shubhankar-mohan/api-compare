import { useState } from 'react';
import { CurlInput } from '@/components/CurlInput';
import { SummaryCard } from '@/components/SummaryCard';
import { DiffViewer } from '@/components/DiffViewer';
import { parseCurl } from '@/lib/curlParser';
import { executeComparison, ComparisonResult } from '@/lib/requestExecutor';
import { computeDiff, formatJson } from '@/lib/diffAlgorithm';
import { toast } from '@/hooks/use-toast';
import { ArrowRightLeft, Github, Code2 } from 'lucide-react';

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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <ArrowRightLeft className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">cURL Compare</h1>
                <p className="text-sm text-muted-foreground">
                  Compare API responses between production and localhost
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Code2 className="h-4 w-4" />
              <span className="text-sm">Developer Tool</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Input Section */}
        <CurlInput onSubmit={handleCompare} isLoading={isLoading} />

        {/* Results Section */}
        {result && (
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
        )}

        {/* Empty State */}
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
      <footer className="border-t mt-auto">
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
