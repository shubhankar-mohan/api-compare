import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Chrome, Shield, Server, Wifi, Lock, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiResponse } from '@/lib/requestExecutor';

interface TroubleshootSectionProps {
  original: ApiResponse;
  localhost: ApiResponse;
}

export function TroubleshootSection({ original, localhost }: TroubleshootSectionProps) {
  const isHttpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const isHttpLocalUrl = localhost.url?.toLowerCase().startsWith('http://');
  const isMixedContent = isHttpsPage && isHttpLocalUrl;

  const bothFailed = !original.success && !localhost.success;
  const onlyLocalhostFailed = original.success && !localhost.success;
  const onlyOriginalFailed = !original.success && localhost.success;

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          Troubleshooting Guide
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status Summary */}
        <div className="grid gap-3 md:grid-cols-2">
          <StatusCard 
            label="Original Domain" 
            url={original.url} 
            success={original.success}
            error={original.error}
          />
          <StatusCard 
            label="Localhost" 
            url={localhost.url} 
            success={localhost.success}
            error={localhost.error}
          />
        </div>

        {/* Troubleshooting Tips */}
        <div className="space-y-4">
          {onlyLocalhostFailed && (
            <>
              {isMixedContent && (
                <TroubleshootItem
                  icon={Lock}
                  title="Mixed Content Blocked"
                  severity="high"
                  description="This page is HTTPS but your localhost URL is HTTP. Browsers block this for security."
                  solutions={[
                    'Use HTTPS for your local server (recommended): https://localhost:8080',
                    'Open this tool in a new tab and run locally over HTTP',
                    'Use a tool like mkcert to generate local SSL certificates'
                  ]}
                />
              )}

              <TroubleshootItem
                icon={Shield}
                title="CORS Not Enabled"
                severity="high"
                description="Your local server must allow browser requests by setting CORS headers."
                solutions={[
                  'Add header: Access-Control-Allow-Origin: *',
                  'Add header: Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS',
                  'Add header: Access-Control-Allow-Headers: Content-Type, Authorization',
                  'Install a CORS unblocker extension in Chrome (search "CORS Unblock")'
                ]}
              />

              <TroubleshootItem
                icon={Chrome}
                title="Try CORS Unblocker Extension"
                severity="medium"
                description="A browser extension can help bypass CORS restrictions during development."
                solutions={[
                  'Search "CORS Unblock" in Chrome Web Store',
                  'Install and enable the extension',
                  'Make sure to open this app in a new tab (not in iframe)',
                  'Click the extension icon to activate it'
                ]}
                action={
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => window.open('https://chrome.google.com/webstore/search/cors%20unblock', '_blank')}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Chrome Web Store
                  </Button>
                }
              />

              <TroubleshootItem
                icon={Server}
                title="Local Server Issues"
                severity="medium"
                description="Make sure your local development server is running and accessible."
                solutions={[
                  'Check if your local server is running',
                  'Verify the port number matches your localhost URL',
                  'Try accessing the URL directly in browser',
                  'Check for firewall blocking the connection',
                  'Ensure the endpoint path exists on your local server'
                ]}
              />

              <TroubleshootItem
                icon={Wifi}
                title="Network Issues"
                severity="low"
                description="Network configuration might be preventing the connection."
                solutions={[
                  'Check if localhost resolves correctly (try 127.0.0.1 instead)',
                  'Verify no VPN is interfering with local connections',
                  'Check Windows/Mac firewall settings',
                  'Try restarting your local development server'
                ]}
              />
            </>
          )}

          {onlyOriginalFailed && (
            <TroubleshootItem
              icon={Server}
              title="Original Server Unreachable"
              severity="high"
              description="The production/original server request failed."
              solutions={[
                'Check if the original URL is correct and accessible',
                'Verify your network connection',
                'The server might be down or blocking requests',
                'Check if authentication is required'
              ]}
            />
          )}

          {bothFailed && (
            <TroubleshootItem
              icon={Wifi}
              title="Both Requests Failed"
              severity="high"
              description="Neither the original nor localhost request succeeded."
              solutions={[
                'Check your internet connection',
                'Verify both URLs are correct',
                'Make sure your local server is running',
                'Check the cURL command for errors'
              ]}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface StatusCardProps {
  label: string;
  url: string;
  success: boolean;
  error?: string;
}

function StatusCard({ label, url, success, error }: StatusCardProps) {
  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg border bg-card">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">{label}</span>
        <Badge variant={success ? "outline" : "destructive"}>
          {success ? 'Success' : 'Failed'}
        </Badge>
      </div>
      <code className="text-xs text-muted-foreground truncate">{url}</code>
      {!success && error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}

interface TroubleshootItemProps {
  icon: typeof AlertTriangle;
  title: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  solutions: string[];
  action?: React.ReactNode;
}

function TroubleshootItem({ icon: Icon, title, severity, description, solutions, action }: TroubleshootItemProps) {
  const severityColors = {
    high: 'border-destructive/50 bg-destructive/5',
    medium: 'border-warning/50 bg-warning/5',
    low: 'border-muted bg-muted/50'
  };

  const badgeVariants = {
    high: 'destructive' as const,
    medium: 'secondary' as const,
    low: 'outline' as const
  };

  return (
    <div className={`p-4 rounded-lg border ${severityColors[severity]}`}>
      <div className="flex items-start gap-3">
        <Icon className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{title}</span>
            <Badge variant={badgeVariants[severity]} className="text-xs">
              {severity === 'high' ? 'Likely Cause' : severity === 'medium' ? 'Check This' : 'Possible'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
          <ul className="text-sm space-y-1">
            {solutions.map((solution, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-muted-foreground">•</span>
                <span>{solution}</span>
              </li>
            ))}
          </ul>
          {action && <div className="pt-2">{action}</div>}
        </div>
      </div>
    </div>
  );
}
