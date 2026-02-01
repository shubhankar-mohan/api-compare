# DiffChecker - API & Text Comparison Tool

## About

DiffChecker is a powerful offline comparison tool that helps developers compare API responses and text content. Built with privacy in mind, all comparisons happen locally in your browser - your data never leaves your machine.

### Key Features

- **Dual Comparison Modes**: 
  - **Production vs Localhost Mode**: Compare production API with your localhost environment
  - **Any Environment Mode**: Compare any two API environments using side-by-side cURL commands
- **API Response Comparison**: Compare API responses between any two environments using cURL commands
- **Text Diff Checker**: Compare any two text inputs with visual diff highlighting
- **File Upload Support**: Upload and compare text files directly (.txt, .json, .js, .ts, .html, .css, .md, .xml, .csv, .log)
- **Find & Replace**: Powerful character/string replacement tool with escape sequence support (\n, \t, \r, etc.) and options to replace in Text A, Text B, or both
- **Command History**: Save and quickly reload previous cURL command pairs
- **Privacy-First**: All processing happens offline in your browser
- **Visual Diff Viewer**: Side-by-side comparison with highlighted differences
- **cURL Support**: Supports GET, POST, PUT, PATCH methods with headers and request bodies
- **JSON Formatting**: Automatically formats and beautifies JSON responses
- **Export Results**: Save comparison results as JSON files for documentation
- **Dark/Light Mode**: Toggle between themes for comfortable viewing

## Use Cases

- **API Development**: Compare responses between production and development environments
- **Debugging**: Identify differences in API responses during troubleshooting
- **Text Comparison**: Compare configuration files, code snippets, or any text content
- **Testing**: Verify API consistency across different environments
- **Migration Validation**: Ensure API compatibility when migrating services

## Project Info

**GitHub Repository**: https://github.com/shubhankar-mohan/api-compare

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

If you used Lovable to create this project, you can visit your project page and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

If you're using Lovable, open your project and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
