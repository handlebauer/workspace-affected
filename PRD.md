# workspace-affected

**A CLI tool for determining which workspace packages are affected by a set of changes in a Bun monorepo.**

Given a git commit range, `workspace-affected` outputs the names of publishable workspace packages that changed, plus any publishable packages that transitively depend on them. It reads dependency information directly from `package.json` files and uses `git diff` to detect changes, requiring no task runner (Turbo, Nx, etc.).

---

## Problem

Monorepo task runners like Turborepo provide "affected" detection, but their implementations operate at the task-graph level rather than the package-dependency level. This means a change to a leaf package can pull in unrelated packages that happen to share build-time dependencies, producing overinclusive results.

For use cases like selective beta publishing, selective CI test runs, or conditional deploys, you need a tighter answer: **which publishable packages changed, and which publishable packages depend on them?**

## Target objective

> Publish (or act on) the changed publishable package(s), plus any publishable packages that transitively depend on them. Do not include dependency packages or unrelated packages.

Example: in a repo where `@acme/core` depends on `@acme/webhooks`, and `@acme/sdk` depends on `@acme/core`:

- Change `@acme/webhooks/src/index.ts` -> affected: `@acme/webhooks`, `@acme/core`, `@acme/sdk`
- Change `@acme/sdk/src/identity.ts` -> affected: `@acme/sdk`
- Change `.github/workflows/ci.yml` -> affected: (none)

---

## CLI interface

### Installation

```bash
bun add -d workspace-affected
```

### Usage

```bash
bunx workspace-affected --since <sha> [options]
```

### Required flags

| Flag            | Description                                                                           |
| --------------- | ------------------------------------------------------------------------------------- |
| `--since <sha>` | Base git commit SHA. Changed files are computed as `git diff --name-only <sha> HEAD`. |

### Optional flags

| Flag                  | Default                    | Description                                                                                                                                                   |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--cwd <path>`        | `.`                        | Repository root directory.                                                                                                                                    |
| `--packages <glob>`   | `packages/**/package.json` | Glob pattern for discovering workspace packages.                                                                                                              |
| `--include-private`   | `false`                    | Include private packages in the publishable set. By default, packages with `"private": true` are excluded.                                                    |
| `--exclude <pattern>` | (none)                     | Glob pattern(s) for paths to exclude from publishable package discovery. Repeatable. Example: `--exclude '**/internal/**'`.                                   |
| `--output <format>`   | `names`                    | Output format. One of `names` (newline-separated package names), `json` (JSON array of package objects), `paths` (newline-separated package directory paths). |
| `--changed-only`      | `false`                    | Only output directly changed packages, skip dependent expansion.                                                                                              |
| `--help`              |                            | Print usage information.                                                                                                                                      |

### Exit codes

| Code | Meaning                                              |
| ---- | ---------------------------------------------------- |
| `0`  | Success. Output may be empty (no affected packages). |
| `1`  | Error (invalid arguments, missing git SHA, etc.).    |

### Examples

```bash
# Basic: which packages are affected since a commit?
bunx workspace-affected --since abc1234

# JSON output for scripting
bunx workspace-affected --since abc1234 --output json

# Custom package location
bunx workspace-affected --since abc1234 --packages 'libs/**/package.json'

# Exclude internal packages
bunx workspace-affected --since abc1234 --exclude '**/internal/**'

# Only directly changed, no dependents
bunx workspace-affected --since abc1234 --changed-only

# Use in CI to conditionally publish
affected=$(bunx workspace-affected --since "$BEFORE_SHA" --output names)
if [ -n "$affected" ]; then
  echo "$affected" | while read pkg; do
    echo "Publishing $pkg..."
  done
fi
```

---

## Algorithm

The tool executes four sequential steps. Each step is a pure function (except the two I/O steps), making the core logic easy to test in isolation.

### Step 1: Get changed files from git

Run `git diff --name-only <since-sha> HEAD` from the repository root. Parse the output into a list of relative file paths.

**Input:** `sinceSha: string`
**Output:** `string[]` of relative file paths
**Errors:** Throw if the SHA does not exist in git history.

```
git diff --name-only abc1234 HEAD
```

```
packages/clients/webhooks/src/factory.ts
packages/clients/webhooks/src/types.ts
.github/workflows/ci.yml
README.md
```

### Step 2: Map changed files to changed packages

For each changed file path, check whether it falls within a known publishable package directory. A file belongs to a package if:

- the file path starts with `<package.path>/`, OR
- the file path exactly equals `<package.packageJsonPath>`

When multiple packages could match (nested package directories), prefer the most specific match (longest path prefix).

Files that don't match any publishable package are ignored.

**Input:** `changedFiles: string[]`, `packages: Package[]`
**Output:** `string[]` of changed publishable package names (sorted, deduplicated)

**Pure function, no I/O.** Testable with fixture data.

### Step 3: Read workspace dependencies from package manifests

For each publishable package, read its `package.json` and collect the names of other publishable packages that appear in any dependency field (`dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`) with a `workspace:` version specifier.

This produces a forward dependency map: for each package, which other publishable packages does it depend on?

**Input:** `packages: Package[]`
**Output:** `Map<string, string[]>` mapping each package name to its publishable workspace dependency names

**I/O:** reads `package.json` files from disk.

### Step 4: Expand through reverse dependency graph

Build the reverse of the forward dependency map from Step 3. The reverse graph answers: "for each package, which publishable packages depend on me?"

Then perform a BFS walk starting from each changed package name (from Step 2), collecting all transitively reachable packages through the reverse graph. This is the final affected set.

**Input:** `changedPackageNames: string[]`, `packages: Package[]`, `dependenciesByPackage: Map<string, string[]>`
**Output:** `string[]` of affected publishable package names (sorted, deduplicated)

**Pure function, no I/O.** Testable with fixture data.

---

## Data types

```typescript
interface Package {
	name: string
	version: string
	path: string // e.g. "packages/clients/core"
	packageJsonPath: string // e.g. "packages/clients/core/package.json"
}
```

---

## Package discovery

Package discovery scans the repository for `package.json` files matching the `--packages` glob, then filters to publishable packages. A package is publishable if:

1. Its path does not contain `node_modules`.
2. Its path does not match any `--exclude` pattern.
3. Its manifest does not have `"private": true` (unless `--include-private` is set).
4. Its manifest has both a `name` and `version` field.

The `Package` object is derived from the manifest and its file path:

- `name` and `version` come from the manifest.
- `path` is the directory containing `package.json`.
- `packageJsonPath` is the relative path to the `package.json` file itself.

---

## Workspace dependency resolution

Only `workspace:` protocol dependencies are considered. This includes:

- `workspace:*`
- `workspace:^`
- `workspace:~`
- Any value starting with `workspace:`

Dependencies pointing to packages outside the publishable set are ignored (they don't affect the reverse graph).

The dependency fields scanned are:

- `dependencies`
- `devDependencies`
- `peerDependencies`
- `optionalDependencies`

`devDependencies` are included because a source change in a dev dependency can still affect the build output or test behavior of the dependent package. If this is too aggressive for some use cases, a future `--production-only` flag could restrict to `dependencies` and `peerDependencies` only.

---

## Testing strategy

### Unit tests (pure functions, no I/O)

These test the core algorithm with fixture data and should be fast (<100ms total).

**Changed file mapping:**

- Maps files under a package directory to the correct package name
- Matches `package.json` itself
- Ignores files outside all package directories
- Prefers most specific package match for nested directories
- Returns empty for empty inputs

**Reverse graph construction:**

- Builds correct reverse edges from a known forward dependency map
- Ignores dependencies pointing outside the publishable set
- Handles packages with no dependencies (leaf nodes)
- Handles packages with no dependents (root nodes)

**BFS expansion:**

- Single changed leaf package with no dependents -> just that package
- Single changed package with direct dependents -> package + dependents
- Single changed package with transitive dependents -> full chain
- Multiple changed packages with overlapping dependents -> deduplicated union
- Unknown package names are silently ignored
- Empty changed list -> empty result

**Target objective tests (using real repo dependency fixtures):**

These use hardcoded fixture data representing a realistic monorepo graph and assert exact expected publish sets for representative scenarios:

| Changed                           | Expected affected set                                                    |
| --------------------------------- | ------------------------------------------------------------------------ |
| `@acme/sdk`                       | `@acme/sdk`                                                              |
| `@acme/cli`                       | `@acme/cli`                                                              |
| `@acme/studio`                    | `@acme/studio`, `@acme/cli`                                              |
| `@acme/webhooks`                  | `@acme/webhooks`, `@acme/core`, `@acme/sdk`, `@acme/studio`, `@acme/cli` |
| `@acme/masterytrack`              | `@acme/masterytrack`, `@acme/cli`                                        |
| `@acme/webhooks` + `@acme/studio` | `@acme/webhooks`, `@acme/core`, `@acme/sdk`, `@acme/studio`, `@acme/cli` |
| `@acme/does-not-exist`            | (none)                                                                   |

### Integration tests (temporary git repos)

These create real temporary git repositories with workspace packages, make commits, and verify end-to-end behavior. They are slower (1-5s each) due to git operations.

**Scenarios:**

- Change a file in package A (which package B depends on) -> both A and B are affected
- No changes between two identical SHAs -> empty result
- Only non-package files changed (README, CI config) -> empty result
- Invalid/missing SHA -> throws descriptive error

---

## Project structure

```
workspace-affected/
  src/
    cli.ts              # CLI entry point (arg parsing, output formatting)
    affected.ts         # Core orchestrator: composes the four steps
    packages.ts         # Package discovery (glob + manifest filtering)
    graph.ts            # Reverse graph construction + BFS expansion
    git.ts              # Git operations (diff, assert commit exists)
  tests/
    affected.test.ts    # Integration tests (temporary git repos)
    graph.test.ts       # Unit tests for graph + expansion logic
    packages.test.ts    # Unit tests for file-to-package mapping
  package.json
  tsconfig.json
```

---

## Implementation notes

**Runtime:** Bun. Use `Bun.file().json()` for manifest reads, `Bun.$` for shell commands, `Bun.Glob` for package discovery.

**Arg parsing:** Use `mri` or `parseArgs` from `node:util`. Keep it minimal.

**Git interaction:** Only two git commands are needed:

- `git cat-file -e <sha>^{commit}` to validate the SHA exists
- `git diff --name-only <sha> HEAD` to get changed files

Both should be run with `nothrow()` / error handling so failures produce clear error messages.

**Performance:** The algorithm is O(P + F + E) where P = number of publishable packages, F = number of changed files, and E = number of dependency edges. For a typical monorepo (<100 packages, <1000 changed files), this completes in under 100ms. The git diff is the only I/O that scales with repo size.

**No caching needed:** The tool runs once per CI invocation. There's no benefit to caching the dependency graph across runs since it's derived from `package.json` files that may have changed in the same commit range.

---

## Reference implementation

This tool was originally built inline within the [timeback-dev](https://github.com/superbuilders/timeback-dev) monorepo as part of a beta publish workflow. The core algorithm (~200 lines of TypeScript) was verified against real workspace dependency graphs and smoke-tested with disposable git worktrees simulating various change scenarios.

The reference files are:

- `scripts/monorepo/lib/affected-publishable-packages.ts` - core logic
- `scripts/monorepo/lib/publishable-packages.ts` - package discovery
- `scripts/monorepo/lib/affected-publishable-packages.internal.test.ts` - full test suite (27 tests)
