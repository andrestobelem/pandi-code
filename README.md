# Pandi

Pandi is a minimal, extensible terminal coding agent. It provides an interactive CLI, print/JSON modes, RPC integration, and an SDK for embedding coding-agent sessions.

## Install

```bash
npm install -g --ignore-scripts pandi-code
pandi
```

`--ignore-scripts` disables dependency lifecycle scripts. Pandi does not require install scripts for normal npm installs.

See the [quickstart](packages/coding-agent/docs/quickstart.md) for authentication and first-session setup.

## Packages

| Package | Description |
|---------|-------------|
| **[pandi-code](packages/coding-agent)** | Pandi CLI, SDK, extensions, and session management |
| **[@earendil-works/pi-ai](packages/ai)** | Retained upstream multi-provider LLM API |
| **[@earendil-works/pi-agent-core](packages/agent)** | Retained upstream agent runtime |
| **[@earendil-works/pi-tui](packages/tui)** | Retained upstream terminal UI library |
| **[@earendil-works/pi-storage-sqlite-node](packages/storage/sqlite-node)** | Retained upstream SQLite storage adapter |
| **[@earendil-works/pi-server](packages/server)** | Unpublished experimental server workspace |

Reusable `@earendil-works/*` libraries remain upstream dependencies and are not published by Pandi. See [ADR-0001](docs/adr/0001-consume-upstream-pi-packages.md) for the package inventory and namespace decision.

## Documentation

- [Pandi CLI documentation](packages/coding-agent/docs/index.md)
- [Settings](packages/coding-agent/docs/settings.md)
- [Extensions](packages/coding-agent/docs/extensions.md)
- [SDK](packages/coding-agent/docs/sdk.md)
- [RPC](packages/coding-agent/docs/rpc.md)
- [Security](SECURITY.md)

## Permissions and sandboxing

Pandi runs with the permissions of the user that launches it. It does not provide a built-in sandbox or permission boundary. Use a container, virtual machine, or another sandbox when stronger isolation is required. See [containerization](packages/coding-agent/docs/containerization.md).

## Development

```bash
npm install --ignore-scripts
npm run build:offline
npm run check
./test.sh
./pandi-test.sh
```

`pandi-test.sh` runs Pandi from source and can be invoked from any working directory. Windows launchers are available as `pandi-test.bat` and `pandi-test.ps1`.

Build a release candidate outside the repository with:

```bash
npm run release:local -- --out /tmp/pandi-local-release --force
/tmp/pandi-local-release/node/pandi --help
/tmp/pandi-local-release/bun/pandi --help
```

See [CONTRIBUTING.md](CONTRIBUTING.md), [AGENTS.md](AGENTS.md), and the [development guide](packages/coding-agent/docs/development.md).

## Upstream attribution

Pandi is derived from [Pi](https://github.com/earendil-works/pi) by Earendil Works and retains substantial upstream code and internal package names. References to Pi and Earendil remain where they identify upstream APIs, dependencies, history, services, or attribution.

## License

MIT
