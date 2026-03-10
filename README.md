# workspace-affected

Detect which workspace packages are affected by a set of changes in a Bun monorepo. **Requires [Bun](https://bun.sh).**

Given a git commit range, outputs the publishable packages that changed plus any publishable packages that transitively depend on them. Uses `package.json` dependency graphs and `git diff` — no task runner required.

## Install

```bash
bun add -d workspace-affected
# or
bunx workspace-affected <command>
```

## Usage

```bash
bunx workspace-affected --since <sha> [options]
```

### Flags

| Flag                | Default                    | Description                  |
| ------------------- | -------------------------- | ---------------------------- |
| `--since <sha>`     | **(required)**             | Base commit SHA              |
| `--cwd <path>`      | `.`                        | Repository root              |
| `--packages <glob>` | `packages/**/package.json` | Workspace manifest glob      |
| `--exclude <glob>`  |                            | Exclude paths (repeatable)   |
| `--include-private` | `false`                    | Include private packages     |
| `--output <mode>`   | `names`                    | `names` \| `paths` \| `json` |
| `--changed-only`    | `false`                    | Skip dependent expansion     |
| `-h`, `--help`      |                            | Print usage                  |

### Examples

```bash
# Which packages changed since a commit?
bunx workspace-affected --since abc1234

# JSON output for scripting
bunx workspace-affected --since abc1234 --output json

# Exclude internal packages
bunx workspace-affected --since abc1234 --exclude '**/internal/**'

# Only directly changed, skip dependents
bunx workspace-affected --since abc1234 --changed-only

# Conditional publish in CI
affected=$(bunx workspace-affected --since "$BEFORE_SHA" --output names)
if [ -n "$affected" ]; then
  echo "$affected" | while read pkg; do
    echo "Publishing $pkg..."
  done
fi
```

## How it works

1. **Discover** workspace packages matching the glob, filtering by publishability
2. **Diff** changed files via `git diff --name-only <sha> HEAD`
3. **Map** changed files to the most specific containing package
4. **Expand** through the reverse dependency graph (BFS) to include all transitively dependent packages

Only `workspace:` protocol dependencies are followed. Non-package files are ignored.

## Programmatic API

```typescript
import { discoverAffectedPackages } from 'workspace-affected'

const affected = await discoverAffectedPackages({
	since: 'abc1234',
	cwd: process.cwd(),
	packagesGlob: 'packages/**/package.json',
	excludePathGlobs: [],
	includePrivate: false,
	changedOnly: false,
})

for (const pkg of affected) {
	console.log(pkg.name, pkg.relativeDirectory)
}
```

## License

MIT
