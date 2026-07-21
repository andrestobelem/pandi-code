# Contributing to Pandi

This guide exists to save contributors and maintainers time.

## Philosophy

Pandi's core is intentionally minimal. Workflow-specific features should usually be extensions. New core behavior and extension hooks must be discussed carefully to avoid unmaintainable interactions.

## The One Rule

**You must understand your code.** If you cannot explain what your changes do and how they interact with the rest of the system, your pull request will be closed.

Using AI to write code is fine. Submitting generated changes without understanding them is not.

If you use an agent, run it from the `pandi-code` repository root so it loads `AGENTS.md` automatically. The agent must follow the rules in that file.

## Contribution Gate

All issues and pull requests from new contributors are auto-closed by default. Maintainers review auto-closed issues and reopen worthwhile ones.

Approval happens through maintainer replies on issues:

- `lgtmi`: future issues will not be auto-closed
- `lgtm`: future issues and pull requests will not be auto-closed

`lgtmi` does not grant approval to submit pull requests. Only `lgtm` does.

## Quality Bar for Issues

Use one of the repository's GitHub issue templates. Keep reports short, concrete, and worth reading.

- State the bug or request clearly.
- Explain why it matters.
- Include minimal reproduction steps and relevant logs for bugs.
- Say whether you want to implement the change.
- Write in your own voice. Clearly label AI-generated content.

Low-signal, unclear, duplicate, or automated bulk reports may be closed without a reply. Accounts that repeatedly ignore this guide or spam the tracker may be blocked.

## Before Submitting a Pull Request

Do not open a pull request unless a maintainer has approved you with `lgtm`.

Keep each change focused on one issue. Link the originating issue and explain both the behavior change and the validation performed.

## Development Setup

```bash
git clone https://github.com/andrestobelem/pandi-code.git
cd pandi-code
npm install --ignore-scripts
npm run build:offline
```

Run Pandi from source:

```bash
./pandi-test.sh
```

Windows launchers are `pandi-test.bat` and `pandi-test.ps1`.

## Validation

Before submitting a pull request:

```bash
npm run check
./test.sh
```

When changing a test file, run that focused test while developing. Do not run endpoint-dependent tests with real provider credentials unless the task explicitly requires them.

Do not edit released changelog sections. New entries belong under `## [Unreleased]` and must follow the rules in `AGENTS.md`.

## Security

Do not open public issues for vulnerabilities. Follow [SECURITY.md](SECURITY.md).

## Upstream Changes

Pandi is derived from [Earendil Works Pi](https://github.com/earendil-works/pi). When porting an upstream change, retain relevant attribution and links to the upstream issue or pull request.

## FAQ

### Why are new issues and pull requests auto-closed?

The gate lets maintainers review the tracker on their own schedule and protects the project from low-effort automated submissions. Short, reproducible reports and thoughtful contributions are welcome.

### Why do some issues receive no reply?

A reply is maintenance work. Maintainers prioritize reproducible bugs, concrete requests, and contributors who make reports actionable.

### Can AI help with contributions?

Yes, but the contributor remains responsible for verifying, understanding, and clearly labeling generated content. Human review remains the final gate.
