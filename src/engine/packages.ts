import { dirname, relative } from 'node:path'

import { normalizePath } from './path'

import type { DiscoverWorkspacePackagesOptions, PackageJson, WorkspacePackage } from '../types'

const WORKSPACE_PREFIX = 'workspace:'

/**
 * Reads and parses a `package.json` file from disk.
 *
 * @param manifestPath - Absolute path to the `package.json` file.
 * @returns Parsed manifest contents.
 */
async function readManifest(manifestPath: string): Promise<PackageJson> {
	return (await Bun.file(manifestPath).json()) as PackageJson
}

/**
 * Determines whether a package manifest represents a publishable package.
 *
 * A manifest is publishable when it is not private and has both a `name`
 * and `version` field.
 *
 * @param manifest - Parsed `package.json` contents.
 * @returns `true` if the manifest qualifies as publishable.
 */
function isPublishableManifest(manifest: PackageJson): boolean {
	return manifest.private !== true && Boolean(manifest.name) && Boolean(manifest.version)
}

/**
 * Converts a discovered manifest into a {@link WorkspacePackage} object.
 *
 * Returns `null` if the manifest is missing a `name` or `version` field,
 * since those are required to identify a workspace package.
 *
 * @param cwd - Absolute path to the repository root.
 * @param manifestPath - Absolute path to the `package.json` file.
 * @param manifest - Parsed manifest contents.
 * @returns A populated workspace package, or `null` if incomplete.
 */
function asWorkspacePackage(
	cwd: string,
	manifestPath: string,
	manifest: PackageJson,
): WorkspacePackage | null {
	if (!manifest.name || !manifest.version) {
		return null
	}

	const directory = dirname(manifestPath)

	return {
		name: manifest.name,
		version: manifest.version,
		private: manifest.private === true,
		manifestPath,
		relativeManifestPath: normalizePath(relative(cwd, manifestPath)),
		directory,
		relativeDirectory: normalizePath(relative(cwd, directory)),
		manifest,
	}
}

/**
 * Discovers workspace packages by scanning for `package.json` files matching
 * a glob pattern, then applying publishability and exclusion filters.
 *
 * @param options - Discovery configuration (cwd, glob, include-private, exclude globs).
 * @returns Array of matching workspace packages, sorted by relative directory path.
 */
export async function discoverWorkspacePackages(
	options: DiscoverWorkspacePackagesOptions,
): Promise<WorkspacePackage[]> {
	const { cwd, packagesGlob, includePrivate, excludePathGlobs } = options
	const excludeMatchers = excludePathGlobs.map(pattern => new Bun.Glob(pattern))
	const glob = new Bun.Glob(packagesGlob)
	const packages: WorkspacePackage[] = []

	for await (const match of glob.scan({ cwd, absolute: true, onlyFiles: true })) {
		const manifest = await readManifest(match)
		const pkg = asWorkspacePackage(cwd, match, manifest)

		if (
			pkg &&
			(includePrivate || isPublishableManifest(manifest)) &&
			!pkg.relativeManifestPath.includes('/node_modules/') &&
			!excludeMatchers.some(matcher => matcher.match(pkg.relativeManifestPath))
		) {
			packages.push(pkg)
		}
	}

	packages.sort((a, b) => a.relativeDirectory.localeCompare(b.relativeDirectory))

	return packages
}

/**
 * Checks whether a file path falls within a given package directory.
 *
 * @param filePath - Repo-relative file path (forward-slash normalized).
 * @param packageDirectory - Repo-relative package directory path.
 * @returns `true` if the file is inside (or exactly at) the package directory.
 */
function isWithinPackage(filePath: string, packageDirectory: string): boolean {
	if (filePath === packageDirectory) {
		return true
	}

	return filePath.startsWith(`${packageDirectory}/`)
}

/**
 * Finds the most specific workspace package that contains a given file.
 *
 * When a file could match multiple packages (nested directories), the package
 * with the longest matching directory prefix wins.
 *
 * @param changedFile - Repo-relative path to a changed file.
 * @param packages - All known workspace packages.
 * @returns The best-matching package, or `undefined` if no package contains the file.
 */
export function pickMostSpecificPackageForFile(
	changedFile: string,
	packages: WorkspacePackage[],
): WorkspacePackage | undefined {
	const normalized = normalizePath(changedFile)
	let best: WorkspacePackage | undefined = undefined

	for (const pkg of packages) {
		if (
			isWithinPackage(normalized, pkg.relativeDirectory) &&
			(!best || pkg.relativeDirectory.length > best.relativeDirectory.length)
		) {
			best = pkg
		}
	}

	return best
}

/**
 * Maps a list of changed file paths to the unique set of package names they
 * belong to.
 *
 * Files that don't fall within any known package are ignored. When multiple
 * files belong to the same package, that package name appears only once.
 *
 * @param changedFiles - Repo-relative changed file paths.
 * @param packages - All known workspace packages.
 * @returns Sorted, deduplicated array of affected package names.
 */
export function mapChangedFilesToPackageNames(
	changedFiles: string[],
	packages: WorkspacePackage[],
): string[] {
	const seen = new Set<string>()
	const names: string[] = []

	for (const file of changedFiles) {
		const pkg = pickMostSpecificPackageForFile(file, packages)

		if (pkg && !seen.has(pkg.name)) {
			seen.add(pkg.name)
			names.push(pkg.name)
		}
	}

	return names.sort((a, b) => a.localeCompare(b))
}

/**
 * Extracts `workspace:` protocol dependency names from a single package manifest.
 *
 * Scans `dependencies`, `devDependencies`, `peerDependencies`, and
 * `optionalDependencies` for entries whose version string starts with `workspace:`.
 *
 * @param manifest - Parsed `package.json` contents.
 * @returns Array of dependency package names using the `workspace:` protocol.
 */
function collectWorkspaceDependencyNames(manifest: PackageJson): string[] {
	const fields = [
		manifest.dependencies,
		manifest.devDependencies,
		manifest.peerDependencies,
		manifest.optionalDependencies,
	]
	const results: string[] = []

	for (const deps of fields) {
		if (deps) {
			for (const [name, range] of Object.entries(deps)) {
				if (range.startsWith(WORKSPACE_PREFIX)) {
					results.push(name)
				}
			}
		}
	}

	return results
}

/**
 * Builds a forward dependency map for workspace packages.
 *
 * For each package, collects the names of other known workspace packages that
 * it depends on via `workspace:` protocol references. Dependencies pointing
 * outside the provided package set are ignored.
 *
 * @param packages - All known workspace packages.
 * @returns Map from each package name to its workspace dependency names (deduplicated).
 */
export function discoverWorkspaceDependencies(packages: WorkspacePackage[]): Map<string, string[]> {
	const knownNames = new Set(packages.map(pkg => pkg.name))
	const dependenciesByPackage = new Map<string, string[]>()

	for (const pkg of packages) {
		const deps = collectWorkspaceDependencyNames(pkg.manifest).filter(name =>
			knownNames.has(name),
		)

		dependenciesByPackage.set(pkg.name, [...new Set(deps)])
	}

	return dependenciesByPackage
}

/**
 * Resolves an ordered list of package names back to full {@link WorkspacePackage}
 * objects, preserving input order.
 *
 * Names that don't match any known package are silently dropped.
 *
 * @param packages - All known workspace packages.
 * @param names - Package names to resolve.
 * @returns Matching workspace packages in the same order as `names`.
 */
export function resolvePackagePaths(
	packages: WorkspacePackage[],
	names: string[],
): WorkspacePackage[] {
	const byName = new Map(packages.map(pkg => [pkg.name, pkg]))
	const result: WorkspacePackage[] = []

	for (const name of names) {
		const pkg = byName.get(name)

		if (pkg) {
			result.push(pkg)
		}
	}

	return result
}
