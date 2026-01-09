import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { FileCode, Shield, Zap, GitBranch, Code2, Terminal, HelpCircle, BookOpen, Users, Lightbulb } from 'lucide-react';

export function FeaturesSection() {
  return (
    <section className="py-12 px-4 max-w-6xl mx-auto">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold mb-4">Powerful Features for Developers</h2>
        <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
          DiffChecker provides a comprehensive suite of tools for comparing API responses and text content. 
          Whether you're debugging API integrations, comparing configuration files, or analyzing JSON payloads, 
          our tools help you identify differences quickly and efficiently.
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <FileCode className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-lg">cURL Command Support</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Import cURL commands directly from your browser's developer tools or terminal. 
              Support for all HTTP methods including GET, POST, PUT, PATCH, and DELETE with full header and body support.
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Headers</Badge>
              <Badge variant="secondary">Authentication</Badge>
              <Badge variant="secondary">Request Body</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/10">
                <Shield className="h-5 w-5 text-accent" />
              </div>
              <CardTitle className="text-lg">Privacy-First Design</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              All processing happens locally in your browser. Your API keys, sensitive data, 
              and request payloads never leave your machine. No server-side storage or logging.
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Offline Mode</Badge>
              <Badge variant="secondary">No Data Collection</Badge>
              <Badge variant="secondary">Client-Side Only</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-lg">Real-Time Comparison</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              See differences highlighted instantly as you type. Toggle between real-time and manual 
              comparison modes. Intelligent diff algorithm identifies additions, deletions, and modifications.
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Instant Feedback</Badge>
              <Badge variant="secondary">Line-by-Line Diff</Badge>
              <Badge variant="secondary">Smart Highlighting</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/10">
                <Code2 className="h-5 w-5 text-accent" />
              </div>
              <CardTitle className="text-lg">JSON Intelligence</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Automatically detects and formats JSON content. Syntax highlighting makes complex 
              JSON structures easy to read. One-click beautification and minification tools.
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Auto-Format</Badge>
              <Badge variant="secondary">Syntax Highlighting</Badge>
              <Badge variant="secondary">Validation</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <GitBranch className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-lg">Advanced Merge Tools</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Resolve differences with interactive merge mode. Accept or reject changes line by line. 
              Export merged results with full control over the final output.
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Interactive Merge</Badge>
              <Badge variant="secondary">Conflict Resolution</Badge>
              <Badge variant="secondary">Export Options</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/10">
                <Terminal className="h-5 w-5 text-accent" />
              </div>
              <CardTitle className="text-lg">Developer Productivity</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Built-in tools for text manipulation including case conversion, sorting, trimming, 
              and line break handling. Streamline your workflow without switching between tools.
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Text Tools</Badge>
              <Badge variant="secondary">Batch Operations</Badge>
              <Badge variant="secondary">Quick Actions</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

export function UsageGuideSection() {
  return (
    <section className="py-12 px-4 max-w-6xl mx-auto bg-muted/30">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold mb-4">How to Use DiffChecker</h2>
        <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
          Get started with our comprehensive guides for both API comparison and text diff checking.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              API Comparison Guide
            </CardTitle>
            <CardDescription>
              Compare API responses between production and localhost environments
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">Step 1: Get Your cURL Command</h4>
              <p className="text-sm text-muted-foreground">
                Open your browser's Developer Tools (F12), navigate to the Network tab, 
                find your API request, right-click and select "Copy as cURL". This captures 
                all headers, cookies, and request parameters automatically.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-2">Step 2: Configure Localhost URL</h4>
              <p className="text-sm text-muted-foreground">
                Enter your local development server URL. DiffChecker will automatically 
                replace the production domain with your localhost URL while preserving 
                the path and query parameters.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-2">Step 3: Compare Responses</h4>
              <p className="text-sm text-muted-foreground">
                Click "Compare APIs" to execute both requests simultaneously. 
                The tool will display status codes, response times, and a detailed 
                diff of the response bodies with color-coded changes.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Step 4: Analyze Differences</h4>
              <p className="text-sm text-muted-foreground">
                Review highlighted differences in the side-by-side view. 
                Green indicates additions in localhost, red shows removals, 
                and yellow highlights modified values. Use the summary card 
                to quickly assess overall changes.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Text Diff Guide
            </CardTitle>
            <CardDescription>
              Compare any two text files, JSON objects, or configuration files
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">Step 1: Input Your Text</h4>
              <p className="text-sm text-muted-foreground">
                Paste your original text in the left panel (Text A) and the modified 
                version in the right panel (Text B). The tool automatically detects 
                JSON and applies appropriate formatting.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-2">Step 2: Choose Comparison Mode</h4>
              <p className="text-sm text-muted-foreground">
                Enable "Real-time diff" for instant feedback as you type, or use 
                manual mode for comparing large texts. The tool supports both plain 
                text and JSON with syntax highlighting.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-2">Step 3: Apply Text Tools</h4>
              <p className="text-sm text-muted-foreground">
                Use built-in tools to normalize text before comparison: convert to 
                lowercase, sort lines alphabetically, trim whitespace, or replace 
                line breaks. These tools help identify meaningful differences.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Step 4: Merge Changes</h4>
              <p className="text-sm text-muted-foreground">
                Activate merge mode to combine changes from both versions. 
                Accept or reject individual changes using the interactive controls, 
                then export your merged result with one click.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

export function FAQSection() {
  const faqs = [
    {
      question: "Is my data secure when using DiffChecker?",
      answer: "Yes, absolutely. DiffChecker operates entirely in your browser using client-side JavaScript. No data is ever sent to our servers or any third-party service. Your API keys, sensitive information, and comparison results remain completely private on your local machine."
    },
    {
      question: "What types of cURL commands are supported?",
      answer: "DiffChecker supports all major HTTP methods (GET, POST, PUT, PATCH, DELETE) along with custom headers (-H flag), request bodies (-d or --data flags), and authentication headers. It can parse both quoted and unquoted URLs, and handles complex cURL commands exported from browser developer tools."
    },
    {
      question: "Can I compare large JSON files?",
      answer: "Yes, DiffChecker can handle large JSON files efficiently. The tool includes automatic JSON formatting and validation, syntax highlighting for better readability, and an optimized diff algorithm that performs well even with complex nested structures."
    },
    {
      question: "How does the merge feature work?",
      answer: "The merge feature allows you to combine changes from two different versions interactively. You can accept or reject individual changes line by line, preview the merged result in real-time, and export the final merged content. This is particularly useful for resolving configuration differences or combining API response variations."
    },
    {
      question: "What's the difference between real-time and manual comparison?",
      answer: "Real-time comparison updates the diff view instantly as you type, ideal for quick edits and small texts. Manual comparison requires clicking the 'Compare' button, which is better for large files or when you want to make multiple changes before viewing the diff."
    },
    {
      question: "Can I use DiffChecker offline?",
      answer: "Yes, once loaded, DiffChecker works completely offline since all processing happens in your browser. You can bookmark the page and use it without an internet connection after the initial load."
    },
    {
      question: "How do I compare APIs with authentication?",
      answer: "Simply include authentication headers in your cURL command. When you copy a cURL command from your browser's developer tools, it automatically includes all headers including authorization tokens, cookies, and API keys. These remain secure as they're never transmitted outside your browser."
    },
    {
      question: "What file formats are supported for text comparison?",
      answer: "DiffChecker supports any text-based format including plain text, JSON, XML, YAML, configuration files, source code, markdown, and more. JSON files receive special treatment with automatic formatting and syntax highlighting."
    },
    {
      question: "How accurate is the diff algorithm?",
      answer: "Our diff algorithm uses advanced techniques to identify not just line-level changes but also inline modifications within lines. It intelligently handles whitespace, formatting differences, and can distinguish between additions, deletions, and modifications for precise comparison results."
    },
    {
      question: "Can I save or export comparison results?",
      answer: "Yes, you can copy any part of the comparison results to your clipboard with one click. The merge feature also allows you to export the combined result. While we don't store data on servers, you can use your browser's local storage to maintain comparison history during your session."
    }
  ];

  return (
    <section className="py-12 px-4 max-w-4xl mx-auto">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold mb-4">Frequently Asked Questions</h2>
        <p className="text-lg text-muted-foreground">
          Find answers to common questions about using DiffChecker for API and text comparison.
        </p>
      </div>

      <Accordion type="single" collapsible className="space-y-4">
        {faqs.map((faq, index) => (
          <AccordionItem key={index} value={`item-${index}`} className="border rounded-lg px-6">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-3 text-left">
                <HelpCircle className="h-5 w-5 text-primary flex-shrink-0" />
                <span className="font-semibold">{faq.question}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground pt-2">
              {faq.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

export function BestPracticesSection() {
  return (
    <section className="py-12 px-4 max-w-6xl mx-auto">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold mb-4">Best Practices & Tips</h2>
        <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
          Learn how to get the most out of DiffChecker with these professional tips and techniques.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-yellow-500" />
              API Testing Best Practices
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Use Environment Variables</h4>
              <p className="text-sm text-muted-foreground">
                Keep your localhost URL consistent by setting it once and reusing it across multiple comparisons.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Test Edge Cases</h4>
              <p className="text-sm text-muted-foreground">
                Compare responses for different user roles, empty results, error conditions, and maximum payload sizes.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Version Control Integration</h4>
              <p className="text-sm text-muted-foreground">
                Document API changes by saving diff results before deploying new versions to production.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Monitor Response Times</h4>
              <p className="text-sm text-muted-foreground">
                Pay attention to response time differences between environments to identify performance issues.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-yellow-500" />
              Text Comparison Tips
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Normalize Before Comparing</h4>
              <p className="text-sm text-muted-foreground">
                Use text tools to standardize formatting, remove trailing spaces, and sort lines for accurate comparison.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Use Real-Time Mode Wisely</h4>
              <p className="text-sm text-muted-foreground">
                Enable real-time diff for small texts and quick edits, but switch to manual mode for large files.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">JSON Formatting</h4>
              <p className="text-sm text-muted-foreground">
                Always format JSON before comparing to ensure differences are semantic, not just formatting-related.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Leverage Merge Mode</h4>
              <p className="text-sm text-muted-foreground">
                Use interactive merge for combining configuration files or resolving differences between versions.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              Team Collaboration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Share cURL Commands</h4>
              <p className="text-sm text-muted-foreground">
                Export cURL commands from browser dev tools to share exact API calls with team members.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Document API Changes</h4>
              <p className="text-sm text-muted-foreground">
                Use diff results to create clear documentation of API response changes between versions.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Standardize Testing</h4>
              <p className="text-sm text-muted-foreground">
                Create a library of cURL commands for common test scenarios to ensure consistent testing.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-green-500" />
              Advanced Techniques
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Chain Comparisons</h4>
              <p className="text-sm text-muted-foreground">
                Compare multiple API endpoints in sequence to test complete user flows and data consistency.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Custom Headers</h4>
              <p className="text-sm text-muted-foreground">
                Add debugging headers to track request flow through your infrastructure and microservices.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Response Validation</h4>
              <p className="text-sm text-muted-foreground">
                Use JSON comparison to validate API responses against expected schemas and data contracts.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

export function UseCasesSection() {
  const useCases = [
    {
      title: "API Development & Debugging",
      description: "Compare API responses between development, staging, and production environments to ensure consistency.",
      icon: Code2,
      scenarios: [
        "Testing new API endpoints before deployment",
        "Debugging response differences across environments",
        "Validating API backward compatibility",
        "Monitoring API response changes after updates"
      ]
    },
    {
      title: "Configuration Management",
      description: "Compare configuration files to identify differences and merge changes safely.",
      icon: FileCode,
      scenarios: [
        "Comparing environment-specific configurations",
        "Merging configuration changes from different branches",
        "Auditing configuration drift between servers",
        "Validating configuration templates"
      ]
    },
    {
      title: "Data Migration Verification",
      description: "Ensure data integrity by comparing responses before and after migrations.",
      icon: GitBranch,
      scenarios: [
        "Verifying data consistency after database migrations",
        "Comparing API responses pre and post migration",
        "Validating data transformation logic",
        "Testing migration rollback procedures"
      ]
    }
  ];

  return (
    <section className="py-12 px-4 max-w-6xl mx-auto bg-muted/30">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold mb-4">Real-World Use Cases</h2>
        <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
          Discover how developers and teams use DiffChecker to streamline their workflows.
        </p>
      </div>

      <div className="space-y-6">
        {useCases.map((useCase, index) => (
          <Card key={index}>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <useCase.icon className="h-5 w-5 text-primary" />
                </div>
                {useCase.title}
              </CardTitle>
              <CardDescription className="text-base">
                {useCase.description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {useCase.scenarios.map((scenario, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <span className="text-sm text-muted-foreground">{scenario}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}