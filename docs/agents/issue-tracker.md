# Issue tracker: GitHub

Issues and PRDs for this repo live in GitHub Issues at `andrestobelem/pandi-code`. Use the `gh` CLI with `--repo andrestobelem/pandi-code` for all operations.

## Conventions

- **Create an issue**: write the body to a temporary file, then run `gh issue create --repo andrestobelem/pandi-code --title "..." --body-file <file>`.
- **Read an issue**: `gh issue view <number> --repo andrestobelem/pandi-code --comments`, filtering comments with `jq` and also fetching labels.
- **List issues**: `gh issue list --repo andrestobelem/pandi-code --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: write the comment to a temporary file, then run `gh issue comment <number> --repo andrestobelem/pandi-code --body-file <file>`.
- **Apply or remove labels**: `gh issue edit <number> --repo andrestobelem/pandi-code --add-label "..."` or `--remove-label "..."`.
- **Close**: `gh issue close <number> --repo andrestobelem/pandi-code`.

Follow the issue and PR requirements in the root `AGENTS.md`, including package labels and AI-generated comment disclaimers.

## Pull requests as a triage surface

**PRs as a request surface: no.**

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --repo andrestobelem/pandi-code --comments` and `gh pr diff <number> --repo andrestobelem/pandi-code`.
- **List external PRs for triage**: `gh pr list --repo andrestobelem/pandi-code --state open --json number,title,body,labels,author,authorAssociation,comments`, then keep only `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE`.
- **Comment, label, or close**: use `gh pr comment`, `gh pr edit`, and `gh pr close` with `--repo andrestobelem/pandi-code`.

GitHub shares one number space across issues and PRs. Resolve a bare `#42` with `gh pr view 42 --repo andrestobelem/pandi-code`, then fall back to `gh issue view 42 --repo andrestobelem/pandi-code`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue in `andrestobelem/pandi-code`.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --repo andrestobelem/pandi-code --comments`.

## Wayfinding operations

Used by `/wayfinder`. The map is a single issue with child issues as tickets.

- **Map**: an issue labelled `wayfinder:map`, holding the Notes, Decisions-so-far, and Fog body.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue. Where sub-issues are unavailable, add the child to a task list in the map and put `Part of #<map>` at the top of the child body. Use a `wayfinder:<type>` label: `research`, `prototype`, `grilling`, or `task`.
- **Blocking**: use GitHub native issue dependencies. Where unavailable, add `Blocked by: #<n>` at the top of the child body.
- **Frontier query**: list the map's open children, drop assigned or blocked issues, and select the first in map order.
- **Claim**: `gh issue edit <number> --repo andrestobelem/pandi-code --add-assignee @me`.
- **Resolve**: comment with the answer, close the issue, then add a context pointer to the map's Decisions-so-far.
