# QCode

TypeScript-based AI coding assistant with local Ollama integration and MCP support.

## ⚠️ Experimental Learning Project

**Fair Warning**: This is my personal exploration into building a coding agent from scratch. Think of it as a "learning in public" experiment where I'm figuring out how LLMs and agentic systems work under the hood – from prompt engineering and tool orchestration to building reliable AI workflows.

While QCode aims to be a serious coding assistant, it's currently more "enthusiastic intern" than "senior developer." It's built with genuine care and follows security best practices, but like any experimental software, it might occasionally suggest renaming your variables to `banana` or get overly excited about recursive directory listings.

**Use at your own discretion.** Test thoroughly in non-critical environments first. And maybe keep a backup handy – not because QCode is malicious, but because learning experiences sometimes involve creative interpretations of user intent.

That said, if you're curious about AI coding assistants, local LLM integration, or just want to see how someone builds an agentic system while learning about LLM behavior, tool calling patterns, and autonomous decision-making, you're welcome aboard this educational journey! 🚀

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

## License

MIT
