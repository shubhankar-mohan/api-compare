import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Lock, Eye, Server, Database, UserCheck, Globe, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

const Privacy = () => {
  const navigate = useNavigate();
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Button 
          onClick={() => navigate('/')}
          variant="ghost"
          className="mb-6"
        >
          ← Back to DiffChecker
        </Button>
        
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 mb-4">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-4xl font-bold mb-4">Privacy Policy</h1>
          <p className="text-lg text-muted-foreground">
            Your privacy is our top priority. Learn how DiffChecker protects your data.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Last updated: January 2024
          </p>
        </div>

        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Data Collection & Storage
              </CardTitle>
            </CardHeader>
            <CardContent className="prose prose-gray dark:prose-invert max-w-none">
              <h3 className="text-lg font-semibold mb-3">What We Don't Collect</h3>
              <p className="text-muted-foreground mb-4">
                DiffChecker is designed with privacy-first principles. We do NOT collect, store, or transmit:
              </p>
              <ul className="space-y-2 text-muted-foreground">
                <li>• API requests or responses you compare</li>
                <li>• cURL commands or authentication tokens</li>
                <li>• Text content you input for comparison</li>
                <li>• Personal identification information</li>
                <li>• Usage patterns or comparison history</li>
              </ul>
              
              <h3 className="text-lg font-semibold mb-3 mt-6">Client-Side Processing</h3>
              <p className="text-muted-foreground">
                All data processing happens entirely in your browser using JavaScript. Your sensitive information,
                including API keys, authentication tokens, and comparison data, never leaves your local machine.
                This means even we cannot access your data.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Analytics & Tracking
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-3">Anonymous Analytics</h3>
                <p className="text-muted-foreground mb-4">
                  We use privacy-focused analytics to understand general usage patterns and improve the tool.
                  This includes:
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li>• Page views and general navigation patterns</li>
                  <li>• Browser and device types (for compatibility)</li>
                  <li>• Geographic regions (country level only)</li>
                  <li>• Feature usage statistics (which tools are used, not what data)</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold mb-3">What We Never Track</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li>• Content of your comparisons</li>
                  <li>• API endpoints or URLs you test</li>
                  <li>• Specific data you input</li>
                  <li>• Individual user behavior</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Third-Party Services
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-3">Advertising</h3>
                <p className="text-muted-foreground mb-4">
                  We display advertisements through Google AdSense to support the free availability of this tool.
                  Google AdSense may use cookies and similar technologies to display relevant ads. You can learn
                  more about Google's privacy practices at their Privacy Policy page.
                </p>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold mb-3">Content Delivery</h3>
                <p className="text-muted-foreground">
                  Static assets (CSS, JavaScript, images) are served through content delivery networks (CDNs)
                  for better performance. These services may collect basic access logs but have no access to
                  your comparison data.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Local Storage
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                DiffChecker may use your browser's local storage to:
              </p>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Remember your theme preference (light/dark mode)</li>
                <li>• Store your last selected tab (API vs Text comparison)</li>
                <li>• Cache tool preferences (like real-time diff setting)</li>
              </ul>
              <p className="text-muted-foreground mt-4">
                This data is stored only in your browser and is never transmitted to any server.
                You can clear this data at any time through your browser settings.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5" />
                Your Rights
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Since we don't collect personal data, traditional data rights (access, deletion, portability)
                don't apply. However, you always have the right to:
              </p>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Use the tool without providing any personal information</li>
                <li>• Clear your browser's local storage at any time</li>
                <li>• Block third-party cookies and advertisements</li>
                <li>• Use the tool with ad blockers enabled</li>
                <li>• Access the tool through privacy-focused browsers or VPNs</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Security Measures
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                We implement several security measures to protect your experience:
              </p>
              <ul className="space-y-2 text-muted-foreground">
                <li>• HTTPS encryption for all connections</li>
                <li>• No server-side data processing or storage</li>
                <li>• Regular security updates and dependency audits</li>
                <li>• Content Security Policy (CSP) headers</li>
                <li>• Protection against XSS and injection attacks</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Contact Us
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                If you have any questions about this Privacy Policy or our practices, please contact us:
              </p>
              <div className="space-y-2 text-muted-foreground">
                <p>• Through GitHub Issues on our repository</p>
                <p>• Email: privacy@diffchecker.example</p>
                <p>• Response time: Within 48 hours</p>
              </div>
              
              <div className="mt-6 p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  <strong>Note:</strong> This privacy policy may be updated periodically. We recommend reviewing
                  it regularly. Significant changes will be announced on the main page.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div className="mt-12 text-center">
          <Button onClick={() => navigate('/')} size="lg">
            Back to DiffChecker
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Privacy;