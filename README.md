# QCode

TypeScript-based AI coding assistant with local Ollama integration and MCP support.

## Quick Start

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run QCode
npm start "list files in src/"
```

## Development

```bash
npm run dev          # Development mode with auto-rebuild
npm test             # Run tests
npm run lint         # Lint code
npm run format       # Format code
```

## Usage Examples

### 📁 File Operations

```bash
# Read files
qcode "show me package.json"
qcode "read the first 10 lines of src/main.ts"
qcode "show me the contents of README.md"

# List files and directories
qcode "list files in src/"
qcode "show me all TypeScript files"
qcode "list all files in the project"

# Search through files
qcode "search for 'function' in TypeScript files"
qcode "find all TODO comments in source files"
qcode "search for 'export' statements"
qcode "find error handling patterns like try/catch"
```

### 🔍 Code Analysis & Understanding

```bash
# Find patterns and structures
qcode "find all React components"
qcode "search for API endpoints in Express files"
qcode "show me all interface definitions"
qcode "find test files and their coverage"

# Project structure analysis
qcode "analyze the project structure"
qcode "list all configuration files"
qcode "show me the dependency structure"
```

### 🛠️ Multi-Step Workflows

```bash
# Search then read workflow
qcode "find files containing 'SearchMatch' and show me the first one"

# List then analyze workflow
qcode "list TypeScript files and show me the main entry point"
qcode "find all components and read the Button component"

# Complex analysis
qcode "search for TODO comments, read the files, and suggest fixes"
qcode "find all API routes and analyze their patterns"
```

### 🔧 Development Assistance

```bash
# Code quality checks
qcode "search for console.log statements in source code"
qcode "find unused imports in TypeScript files"
qcode "search for any hardcoded URLs or secrets"

# Documentation and comments
qcode "find all files with missing documentation"
qcode "search for FIXME or TODO comments"
qcode "show me all JSDoc comments in the codebase"

# Debugging and troubleshooting
qcode "find error handling in the authentication module"
qcode "search for try-catch blocks in the API layer"
qcode "show me all logging statements"
```

### ⚙️ Advanced Features

```bash
# Pattern matching with regex
qcode "search for lines starting with 'export' using regex '^export'"

# File type specific searches
qcode "search for 'interface' in .ts files only"
qcode "find all CSS classes in stylesheet files"

# Context-aware operations
qcode "read configuration files and check for inconsistencies"
qcode "analyze test files and their corresponding source files"
```

### 💡 Real-World Examples

```bash
# React/Frontend projects
qcode "find all React hooks usage in components"
qcode "search for useState and useEffect in the codebase"
qcode "list all CSS modules and their imports"

# Backend/API projects
qcode "find all Express route handlers"
qcode "search for database queries in the models"
qcode "show me all middleware functions"

# General project maintenance
qcode "find all package.json files in a monorepo"
qcode "search for outdated npm packages"
qcode "analyze tsconfig.json settings across the project"
```

## License

MIT
