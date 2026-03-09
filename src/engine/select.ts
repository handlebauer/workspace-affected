import { assertCommitExists, getChangedFilesSince } from './git'
import { buildReverseGraph, expandChangedPackageNames } from './graph'
import {
	discoverWorkspaceDependencies,
	discoverWorkspacePackages,
	mapChangedFilesToPackageNames,
	resolvePackagePaths,
} from './packages'

import type { DiscoverAffectedPackagesOptions, WorkspacePackage } from '../types'

/**
 * Discovers affected publishable packages since a given commit.
 *
 * Orchestrates the full pipeline:
 * 1. Discover workspace packages matching the glob and filtering rules.
 * 2. Get changed files from git between `options.since` and HEAD.
 * 3. Map changed files to the packages they belong to.
 * 4. (Unless `changedOnly`) Expand through reverse dependency graph to include
 *    all transitively dependent publishable packages.
 *
 * @param options - Configuration for the affected package discovery.
 * @returns Array of affected workspace packages, sorted by directory path.
 */
export async function discoverAffectedPackages(
	options: DiscoverAffectedPackagesOptions,
): Promise<WorkspacePackage[]> {
	const packages = await discoverWorkspacePackages({
		cwd: options.cwd,
		packagesGlob: options.packagesGlob,
		includePrivate: options.includePrivate,
		excludePathGlobs: options.excludePathGlobs,
	})

	if (packages.length === 0) {
		return []
	}

	await assertCommitExists(options.cwd, options.since)

	const changedFiles = await getChangedFilesSince(options.cwd, options.since)
	const changedPackageNames = mapChangedFilesToPackageNames(changedFiles, packages)

	if (changedPackageNames.length === 0) {
		return []
	}

	if (options.changedOnly) {
		return resolvePackagePaths(packages, changedPackageNames)
	}

	const dependenciesByPackage = discoverWorkspaceDependencies(packages)
	const reverseGraph = buildReverseGraph(dependenciesByPackage)
	const expandedNames = expandChangedPackageNames(changedPackageNames, reverseGraph)

	return resolvePackagePaths(packages, expandedNames)
}
