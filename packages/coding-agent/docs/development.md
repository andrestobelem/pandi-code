# Development

See [AGENTS.md](https://github.com/andrestobelem/pandi-code/blob/main/AGENTS.md) for additional guidelines.

## Setup

```bash
git clone https://github.com/andrestobelem/pandi-code.git
cd pandi-code
npm install --ignore-scripts
npm run build:offline
```

Run from source:

```bash
/path/to/pandi-code/pandi-test.sh
```

The script can be run from any directory. Pandi keeps the caller's current working directory.

## Application identity

The installable application metadata lives in `packages/coding-agent/package.json`:

```json
{
  "name": "pandi-code",
  "piConfig": {
    "name": "pandi",
    "configDir": ".pandi"
  },
  "bin": {
    "pandi": "dist/cli.js"
  }
}
```

The retained `piConfig` property controls the CLI banner, config paths, and derived environment-variable names.

## Path Resolution

Three execution modes: npm install, standalone binary, tsx from source.

**Always use `src/config.ts`** for package assets:

```typescript
import { getPackageDir, getThemeDir } from "./config.js";
```

Never use `__dirname` directly for package assets.

## Debug Command

`/debug` (hidden) writes to `~/.pandi/agent/pandi-debug.log`:
- Rendered TUI lines with ANSI codes
- Last messages sent to the LLM

## Testing

```bash
./test.sh                         # Run all non-e2e tests
cd packages/coding-agent
node node_modules/vitest/dist/cli.js --run test/specific.test.ts
```

## Project Structure

```
packages/
  ai/           # LLM provider abstraction
  agent/        # Agent loop and message types  
  tui/          # Terminal UI components
  coding-agent/ # CLI and interactive mode
```
