export interface PackageJson {
	name?: string
	version?: string
	private?: boolean
	dependencies?: Record<string, string>
	devDependencies?: Record<string, string>
	peerDependencies?: Record<string, string>
	optionalDependencies?: Record<string, string>
}

export interface WorkspacePackage {
	name: string
	version: string | undefined
	private: boolean
	manifestPath: string
	relativeManifestPath: string
	directory: string
	relativeDirectory: string
	manifest: PackageJson
}

export interface DiscoverWorkspacePackagesOptions {
	cwd: string
	packagesGlob: string
	includePrivate: boolean
	excludePathGlobs: string[]
}

export interface DiscoverAffectedPackagesOptions {
	since: string
	cwd: string
	packagesGlob: string
	excludePathGlobs: string[]
	includePrivate: boolean
	changedOnly: boolean
}
