import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Scale, AlertTriangle, CheckCircle, XCircle, Heart, Globe, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

const Terms = () => {
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
            <Scale className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-4xl font-bold mb-4">Terms of Service</h1>
          <p className="text-lg text-muted-foreground">
            Please read these terms carefully before using DiffChecker.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Last updated: January 2024
          </p>
        </div>

        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Agreement to Terms
              </CardTitle>
            </CardHeader>
            <CardContent className="prose prose-gray dark:prose-invert max-w-none">
              <p className="text-muted-foreground mb-4">
                By accessing and using DiffChecker ("the Service"), you agree to be bound by these Terms of Service
                ("Terms"). If you disagree with any part of these terms, you do not have permission to access the Service.
              </p>
              <p className="text-muted-foreground">
                DiffChecker is a free, browser-based tool for comparing API responses and text content. The Service
                operates entirely client-side, meaning all data processing occurs in your browser without transmission
                to our servers.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                Acceptable Use
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">You may use DiffChecker to:</p>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Compare API responses for development and debugging purposes</li>
                <li>• Analyze differences between text files and JSON objects</li>
                <li>• Test API endpoints across different environments</li>
                <li>• Merge and reconcile configuration differences</li>
                <li>• Validate data consistency and integrity</li>
                <li>• Educational and learning purposes</li>
                <li>• Any lawful commercial or personal use</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-500" />
                Prohibited Use
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">You may NOT use DiffChecker to:</p>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Process illegal, harmful, or malicious content</li>
                <li>• Attempt to hack, exploit, or damage the Service</li>
                <li>• Violate any applicable laws or regulations</li>
                <li>• Infringe on intellectual property rights</li>
                <li>• Harass, abuse, or harm others</li>
                <li>• Attempt to bypass security measures</li>
                <li>• Overload or disrupt the Service through automated means</li>
                <li>• Reverse engineer or attempt to extract source code</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                Disclaimers & Limitations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-3">No Warranty</h3>
                <p className="text-muted-foreground">
                  DiffChecker is provided "as is" and "as available" without warranties of any kind, either express
                  or implied. We do not guarantee that the Service will be uninterrupted, secure, or error-free.
                  Use of the Service is at your own risk.
                </p>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold mb-3">Limitation of Liability</h3>
                <p className="text-muted-foreground">
                  To the maximum extent permitted by law, we shall not be liable for any indirect, incidental,
                  special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred
                  directly or indirectly, or any loss of data, use, goodwill, or other intangible losses.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3">Data Responsibility</h3>
                <p className="text-muted-foreground">
                  You are solely responsible for the data you process using DiffChecker. We recommend not using
                  the Service with highly sensitive information such as passwords, private keys, or confidential
                  business data. Although data is processed locally, you should always exercise caution.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Intellectual Property
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-3">Service Ownership</h3>
                <p className="text-muted-foreground">
                  The Service, including its original content, features, and functionality, is owned by
                  Virtualis World and is protected by international copyright, trademark, patent, trade secret,
                  and other intellectual property laws.
                </p>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold mb-3">Your Content</h3>
                <p className="text-muted-foreground">
                  You retain all rights to the content you process using DiffChecker. Since we don't collect
                  or store your data, we make no claims to ownership of your content. You are responsible for
                  ensuring you have the right to use any content you process.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3">Open Source Components</h3>
                <p className="text-muted-foreground">
                  DiffChecker uses open source libraries and components. These are used under their respective
                  licenses, which are available in our GitHub repository.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Third-Party Services
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                DiffChecker may display advertisements through third-party ad networks (Google AdSense).
                These services have their own terms and privacy policies:
              </p>
              <ul className="space-y-2 text-muted-foreground">
                <li>• You may use ad blockers if you prefer not to see advertisements</li>
                <li>• Third-party services may use cookies for ad personalization</li>
                <li>• We are not responsible for the content of advertisements</li>
                <li>• Ad networks operate under their own terms of service</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-red-500" />
                Indemnification
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                You agree to indemnify and hold harmless Virtualis World, its affiliates, and their respective
                officers, directors, employees, and agents from any claims, damages, losses, liabilities, and
                expenses (including legal fees) arising from:
              </p>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Your use of the Service</li>
                <li>• Your violation of these Terms</li>
                <li>• Your violation of any rights of another party</li>
                <li>• Your violation of any applicable laws</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Changes to Terms
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                We reserve the right to modify these Terms at any time. Changes will be effective immediately
                upon posting. Your continued use of the Service after changes constitutes acceptance of the
                modified Terms.
              </p>
              <p className="text-muted-foreground">
                We recommend checking these Terms periodically. Significant changes will be announced on the
                main page of the Service.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scale className="h-5 w-5" />
                Governing Law
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                These Terms shall be governed by and construed in accordance with the laws of the jurisdiction
                in which Virtualis World operates, without regard to conflict of law provisions.
              </p>
              <p className="text-muted-foreground">
                Any disputes arising from these Terms or your use of the Service shall be resolved through
                binding arbitration or in the courts of the applicable jurisdiction.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                For questions about these Terms of Service, please contact us:
              </p>
              <div className="space-y-2 text-muted-foreground">
                <p>• GitHub Issues: Report on our repository</p>
                <p>• Email: legal@diffchecker.example</p>
                <p>• Response time: Within 72 hours</p>
              </div>
              
              <div className="mt-6 p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  <strong>Effective Date:</strong> These Terms of Service are effective as of January 1, 2024
                  and will remain in effect except with respect to any changes in their provisions in the future.
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

export default Terms;