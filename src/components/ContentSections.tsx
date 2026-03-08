import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { FileCode, Shield, Zap, GitBranch, Code2, Terminal, HelpCircle, BookOpen, Users, Lightbulb } from 'lucide-react';

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="mb-8 flex items-center gap-4">
      <span className="rule-line" />
      <span className="section-label whitespace-nowrap">{children}</span>
      <span className="rule-line" />
    </div>
  );
}

export function FeaturesSection() {
  return (
    <section className="py-16 px-4 sm:px-6 lg:px-8">
      <SectionLabel>Features</SectionLabel>
      <div className="text-center mb-12">
        <h2 className="text-3xl font-medium mb-4">Powerful Features for Developers</h2>
        <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
          A comprehensive suite of tools for comparing API responses and text content.
          Debug integrations, compare configs, and analyze JSON payloads — all in your browser.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <FeatureCard icon={FileCode} title="cURL Command Support" description="Import cURL commands directly from browser dev tools. Full support for all HTTP methods, headers, auth, and request bodies." tags={["Headers", "Auth", "Body"]} />
        <FeatureCard icon={Shield} title="Privacy-First Design" description="All processing happens locally in your browser. API keys and sensitive data never leave your machine." tags={["Offline", "No Tracking", "Client-Side"]} />
        <FeatureCard icon={Zap} title="Real-Time Comparison" description="See differences highlighted instantly as you type. Smart diff algorithm identifies additions, deletions, and modifications." tags={["Instant", "Line-by-Line", "Inline Diff"]} />
        <FeatureCard icon={Code2} title="JSON Intelligence" description="Auto-detects and formats JSON. Syntax highlighting makes complex structures easy to read with one-click beautification." tags={["Auto-Format", "Highlighting", "Validation"]} />
        <FeatureCard icon={GitBranch} title="Advanced Merge Tools" description="Interactive merge mode lets you accept or reject changes line by line and export merged results." tags={["Merge", "Conflict Resolution", "Export"]} />
        <FeatureCard icon={Terminal} title="Developer Productivity" description="Built-in text tools: case conversion, sorting, trimming, and line break handling without switching apps." tags={["Text Tools", "Batch Ops", "Quick Actions"]} />
      </div>
    </section>
  );
}

function FeatureCard({ icon: Icon, title, description, tags }: {
  icon: typeof FileCode;
  title: string;
  description: string;
  tags: string[];
}) {
  return (
    <Card className="group hover:shadow-md hover:scale-[1.02] cursor-default">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-primary/10 group-hover:bg-primary/15 transition-colors duration-300">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <CardTitle className="text-lg">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{description}</p>
        <div className="flex flex-wrap gap-2">
          {tags.map(tag => (
            <span key={tag} className="font-mono text-[11px] tracking-[0.06em] uppercase text-primary/80 bg-primary/8 px-3 py-1 rounded-full">
              {tag}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function UsageGuideSection() {
  return (
    <section className="py-16 px-4 sm:px-6 lg:px-8 bg-card/50">
      <SectionLabel>How to Use</SectionLabel>
      <div className="text-center mb-12">
        <h2 className="text-3xl font-medium mb-4">How to Use DiffChecker</h2>
        <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
          Get started with our guides for both API comparison and text diff checking.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl mx-auto">
        <GuideCard
          icon={BookOpen}
          title="API Comparison Guide"
          subtitle="Compare API responses between any two environments"
          steps={[
            { title: "Get Your cURL Command", text: "Open Developer Tools (F12), Network tab, right-click your request and \"Copy as cURL\"." },
            { title: "Configure Localhost URL", text: "Enter your local server URL. The production path and query parameters are preserved automatically." },
            { title: "Compare Responses", text: "Click compare to execute both requests. View status codes, response times, and color-coded diffs." },
            { title: "Analyze Differences", text: "Side-by-side view with green for additions, red for removals. Summary card shows overall changes." },
          ]}
        />
        <GuideCard
          icon={BookOpen}
          title="Text Diff Guide"
          subtitle="Compare any two text files, JSON objects, or configs"
          steps={[
            { title: "Input Your Text", text: "Paste original in Text A and modified in Text B. JSON is auto-detected and formatted." },
            { title: "Choose Comparison Mode", text: "Real-time diff for instant feedback, or manual mode for large texts." },
            { title: "Apply Text Tools", text: "Normalize with case conversion, sorting, trimming, or line break replacement." },
            { title: "Merge Changes", text: "Accept or reject individual changes interactively, then export the merged result." },
          ]}
        />
      </div>
    </section>
  );
}

function GuideCard({ icon: Icon, title, subtitle, steps }: {
  icon: typeof BookOpen;
  title: string;
  subtitle: string;
  steps: { title: string; text: string }[];
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 mb-1">
          <div className="p-2 rounded-xl bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <CardTitle>{title}</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {steps.map((step, i) => (
          <div key={i} className="flex gap-4">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-xs font-medium text-primary">{i + 1}</span>
            </div>
            <div>
              <h4 className="text-sm font-medium mb-1">{step.title}</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">{step.text}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function FAQSection() {
  const faqs = [
    { question: "Is my data secure when using DiffChecker?", answer: "Yes, absolutely. DiffChecker operates entirely in your browser using client-side JavaScript. No data is ever sent to our servers or any third-party service. Your API keys, sensitive information, and comparison results remain completely private on your local machine." },
    { question: "What types of cURL commands are supported?", answer: "DiffChecker supports all major HTTP methods (GET, POST, PUT, PATCH, DELETE) along with custom headers (-H flag), request bodies (-d or --data flags), and authentication headers. It can parse both quoted and unquoted URLs, and handles complex cURL commands exported from browser developer tools." },
    { question: "Can I compare large JSON files?", answer: "Yes, DiffChecker can handle large JSON files efficiently. The tool includes automatic JSON formatting and validation, syntax highlighting for better readability, and an optimized diff algorithm that performs well even with complex nested structures." },
    { question: "How does the merge feature work?", answer: "The merge feature allows you to combine changes from two different versions interactively. You can accept or reject individual changes line by line, preview the merged result in real-time, and export the final merged content." },
    { question: "What's the difference between real-time and manual comparison?", answer: "Real-time comparison updates the diff view instantly as you type, ideal for quick edits and small texts. Manual comparison requires clicking the 'Compare' button, which is better for large files." },
    { question: "Can I use DiffChecker offline?", answer: "Yes, once loaded, DiffChecker works completely offline since all processing happens in your browser. You can bookmark the page and use it without an internet connection after the initial load." },
    { question: "How do I compare APIs with authentication?", answer: "Simply include authentication headers in your cURL command. When you copy a cURL command from your browser's developer tools, it automatically includes all headers including authorization tokens, cookies, and API keys." },
    { question: "What file formats are supported for text comparison?", answer: "DiffChecker supports any text-based format including plain text, JSON, XML, YAML, configuration files, source code, markdown, and more. JSON files receive special treatment with automatic formatting and syntax highlighting." },
    { question: "How accurate is the diff algorithm?", answer: "Our diff algorithm uses advanced techniques to identify not just line-level changes but also inline modifications within lines. It intelligently handles whitespace, formatting differences, and can distinguish between additions, deletions, and modifications." },
    { question: "Can I save or export comparison results?", answer: "Yes, you can copy any part of the comparison results to your clipboard with one click. The merge feature also allows you to export the combined result. Your browser's local storage maintains comparison history during your session." },
  ];

  return (
    <section className="py-16 px-4 sm:px-6 lg:px-8">
      <SectionLabel>FAQ</SectionLabel>
      <div className="text-center mb-12">
        <h2 className="text-3xl font-medium mb-4">Frequently Asked Questions</h2>
        <p className="text-lg text-muted-foreground">
          Common questions about using DiffChecker for API and text comparison.
        </p>
      </div>

      <Accordion type="single" collapsible className="space-y-3 max-w-4xl mx-auto">
        {faqs.map((faq, index) => (
          <AccordionItem key={index} value={`item-${index}`} className="rounded-3xl bg-card px-6 border-0 shadow-sm hover:shadow-md transition-all duration-300">
            <AccordionTrigger className="hover:no-underline min-h-[48px] touch-manipulation py-5">
              <div className="flex items-center gap-3 text-left">
                <HelpCircle className="h-5 w-5 text-primary flex-shrink-0" />
                <span className="font-medium text-base">{faq.question}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground pt-0 pb-5 leading-relaxed text-base">
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
    <section className="py-16 px-4 sm:px-6 lg:px-8 bg-card/50">
      <SectionLabel>Best Practices</SectionLabel>
      <div className="text-center mb-12">
        <h2 className="text-3xl font-medium mb-4">Best Practices & Tips</h2>
        <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
          Get the most out of DiffChecker with these professional tips and techniques.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-6xl mx-auto auto-rows-fr">
        <TipsCard icon={Lightbulb} title="API Testing" tips={[
          { title: "Use Environment Variables", text: "Keep your localhost URL consistent by setting it once and reusing across comparisons." },
          { title: "Test Edge Cases", text: "Compare responses for different user roles, empty results, error conditions, and max payloads." },
          { title: "Version Control", text: "Save diff results before deploying new versions to document API changes." },
          { title: "Monitor Response Times", text: "Watch for timing differences between environments to catch performance issues." },
        ]} />
        <TipsCard icon={Lightbulb} title="Text Comparison" tips={[
          { title: "Normalize First", text: "Use text tools to standardize formatting, remove trailing spaces, and sort lines." },
          { title: "Real-Time Mode", text: "Enable for small texts and quick edits, switch to manual for large files." },
          { title: "JSON Formatting", text: "Always format JSON before comparing to ensure differences are semantic." },
          { title: "Merge Mode", text: "Use interactive merge for combining configuration files or resolving version differences." },
        ]} />
        <TipsCard icon={Users} title="Team Collaboration" tips={[
          { title: "Share cURL Commands", text: "Export from browser dev tools to share exact API calls with team members." },
          { title: "Document Changes", text: "Use diff results to create clear documentation of API response changes." },
          { title: "Standardize Testing", text: "Create a library of cURL commands for common test scenarios." },
        ]} />
        <TipsCard icon={Terminal} title="Advanced Techniques" tips={[
          { title: "Chain Comparisons", text: "Compare multiple endpoints in sequence to test complete user flows." },
          { title: "Custom Headers", text: "Add debugging headers to track request flow through your infrastructure." },
          { title: "Response Validation", text: "Use JSON comparison to validate API responses against expected schemas." },
        ]} />
      </div>
    </section>
  );
}

function TipsCard({ icon: Icon, title, tips }: {
  icon: typeof Lightbulb;
  title: string;
  tips: { title: string; text: string }[];
}) {
  return (
    <Card className="group hover:shadow-md hover:scale-[1.01] transition-all duration-300">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-primary/10 group-hover:bg-primary/15 transition-colors duration-300">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <CardTitle className="text-lg">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {tips.map((tip, i) => (
          <div key={i} className="space-y-1">
            <h4 className="text-sm font-medium">{tip.title}</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">{tip.text}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function UseCasesSection() {
  const useCases = [
    {
      title: "API Development & Debugging",
      description: "Compare API responses between development, staging, and production environments to ensure consistency.",
      icon: Code2,
      scenarios: ["Testing new API endpoints before deployment", "Debugging response differences across environments", "Validating API backward compatibility", "Monitoring API response changes after updates"]
    },
    {
      title: "Configuration Management",
      description: "Compare configuration files to identify differences and merge changes safely.",
      icon: FileCode,
      scenarios: ["Comparing environment-specific configurations", "Merging configuration changes from different branches", "Auditing configuration drift between servers", "Validating configuration templates"]
    },
    {
      title: "Data Migration Verification",
      description: "Ensure data integrity by comparing responses before and after migrations.",
      icon: GitBranch,
      scenarios: ["Verifying data consistency after database migrations", "Comparing API responses pre and post migration", "Validating data transformation logic", "Testing migration rollback procedures"]
    }
  ];

  return (
    <section className="py-16 px-4 sm:px-6 lg:px-8">
      <SectionLabel>Use Cases</SectionLabel>
      <div className="text-center mb-12">
        <h2 className="text-3xl font-medium mb-4">Real-World Use Cases</h2>
        <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
          Discover how developers and teams use DiffChecker to streamline their workflows.
        </p>
      </div>

      <div className="space-y-6 max-w-6xl mx-auto">
        {useCases.map((useCase, index) => (
          <Card key={index} className="group hover:shadow-md">
            <CardHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2.5 rounded-2xl bg-primary/10 group-hover:bg-primary/15 transition-colors duration-300">
                  <useCase.icon className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-xl">{useCase.title}</CardTitle>
              </div>
              <p className="text-base text-muted-foreground">{useCase.description}</p>
            </CardHeader>
            <CardContent>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {useCase.scenarios.map((scenario, idx) => (
                  <li key={idx} className="flex items-start gap-2 group/item hover:translate-x-1 transition-transform duration-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
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
