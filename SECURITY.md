# Security Policy

Pandi is a local coding agent that runs inside the security boundary of the user that launches it. Users are responsible for monitoring its operations or containing it in a container, virtual machine, or other sandbox.

Pandi treats the local account and files writable by that account as part of the same trust boundary as the Pandi process. If an attacker can already modify a user's workspace, home directory, shell startup files, environment, or Pandi configuration, they can generally influence Pandi and other local developer tools.

Extensions execute arbitrary code, and skills or repository instructions can direct the model to perform arbitrary actions. Install extensions only from trusted sources and use Pandi only in repositories whose instructions you trust.

## Reporting a vulnerability

Use a private [GitHub Security Advisory](https://github.com/andrestobelem/pandi-code/security/advisories/new) for this repository. Do not open a public issue for security-sensitive reports.

Include:

- A description of the issue and impact
- Reproduction steps, proof of concept, or relevant logs
- Affected package, version, commit, or configuration
- Known mitigations

For vulnerabilities that affect unchanged upstream Pi code, also identify the relevant upstream component so maintainers can coordinate disclosure when appropriate.

## In scope

- Security boundary bypasses introduced by Pandi
- Vulnerabilities in distributed packages, command-line tools, APIs, or repository code
- Dependency vulnerabilities that are reachable through shipped Pandi functionality

## Out of scope

- Expected local code execution by the coding agent
- Prompt injection
- Behavior of user-installed extensions or skills
- Risks from trusted repository instructions or user-controlled configuration
- Risks from installing untrusted packages or tools
- Public internet exposure of a local Pandi process
- User-approved or user-initiated actions presented as vulnerabilities
- Reports requiring prior write access to user-controlled files, environment variables, shell configuration, `~/.pandi`, or workspace files, unless Pandi itself grants that access or crosses an operating-system privilege boundary
- Malicious model output
- Third-party or user-controlled credentials exposed outside Pandi's control

The most useful reports demonstrate a current, reproducible boundary bypass against the latest release or `main` with concrete impact.
