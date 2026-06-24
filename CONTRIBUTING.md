# Contributing to zotero-validate

Thank you for your interest in contributing. This document covers how to report issues, set up a development environment, and submit changes.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating, you are expected to uphold it.

## How to Contribute

### Reporting Issues

- Use the issue templates for bugs and feature requests.
- Do not report security vulnerabilities in public issues -- see [SECURITY.md](SECURITY.md).

### Development Setup

Prerequisites: Node.js 18+, Zotero 7 (for testing the plugin).

```bash
git clone https://github.com/dcondrey/zotero-validate.git
cd zotero-validate
npm install
npm run build
```

### Submitting Changes

1. Fork the repository and create a branch from `main`.
2. Make changes and add tests where applicable.
3. Run `npx tsc --noEmit` and fix any type errors.
4. Run the tests: `npm test`.
5. Open a pull request with a clear description.

### Commit Style

Use Conventional Commits: `fix:`, `feat:`, `docs:`, `refactor:`, `test:`, `chore:`. Single-line, imperative, no trailing period.
