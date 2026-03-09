# `workspace-affected`

CLI tool that determines which workspace packages are affected by a set of changes in a Bun monorepo. Given a git commit range, it outputs publishable packages that changed plus any publishable packages that transitively depend on them — using `package.json` dependency graphs and `git diff`, no task runner required.

## Commands

| Command         | Purpose        |
| --------------- | -------------- |
| `bun run check` | Verify changes |
| `bun test`      | Run tests      |

- Never use `tsc` directly
- Always use `required_permissions: ["all"]` for terminal operations

## Commits & PRs

Pre-commit hooks automatically run tests and checks (via husky).

## Conventions

- DO NOT DEFAULT INTO ASSUMING BACKWARDS-COMPATIBILITY IS PREFERABLE
