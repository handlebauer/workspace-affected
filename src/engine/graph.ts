/**
 * Inverts a forward dependency map into a reverse (dependent) map.
 *
 * Given a map where each key is a package name and values are the names of
 * packages it depends on, produces a map where each key is a package name and
 * values are the names of packages that depend on it.
 *
 * @param dependenciesByPackage - Forward dependency map (package -> its dependencies).
 * @returns Reverse dependency map (package -> packages that depend on it).
 *   Entries are sorted and deduplicated.
 */
export function buildReverseGraph(
	dependenciesByPackage: Map<string, string[]>,
): Map<string, string[]> {
	const reverse = new Map<string, string[]>()

	for (const [pkgName] of dependenciesByPackage) {
		if (!reverse.has(pkgName)) {
			reverse.set(pkgName, [])
		}
	}

	for (const [consumer, dependencies] of dependenciesByPackage) {
		for (const dependency of dependencies) {
			const dependents = reverse.get(dependency) ?? []

			dependents.push(consumer)
			reverse.set(dependency, dependents)
		}
	}

	for (const [name, dependents] of reverse) {
		dependents.sort((a, b) => a.localeCompare(b))
		reverse.set(name, [...new Set(dependents)])
	}

	return reverse
}

/**
 * BFS-expands a set of changed package names through the reverse dependency graph,
 * collecting all transitively affected packages.
 *
 * Packages not present in the reverse graph (unknown names) are silently skipped.
 *
 * @param changedPackageNames - Package names that have direct file changes.
 * @param reverseGraph - Reverse dependency map from {@link buildReverseGraph}.
 * @returns Deduplicated list of affected package names (changed + transitive dependents).
 */
export function expandChangedPackageNames(
	changedPackageNames: string[],
	reverseGraph: Map<string, string[]>,
): string[] {
	const queue = [...changedPackageNames].sort((a, b) => a.localeCompare(b))
	const visited = new Set<string>()
	const expanded: string[] = []

	while (queue.length > 0) {
		const current = queue.shift()

		if (!current || visited.has(current) || !reverseGraph.has(current)) {
			// biome-ignore lint: skip already-visited or unknown packages
			void 0
		} else {
			visited.add(current)
			expanded.push(current)

			const dependents = reverseGraph.get(current) ?? []

			for (const dependent of dependents) {
				if (!visited.has(dependent)) {
					queue.push(dependent)
				}
			}
		}
	}

	return expanded
}
