import { normalizePath } from './path'

/**
 * Splits raw shell output into trimmed, non-empty lines.
 *
 * @param stdout - Raw string output from a shell command.
 * @returns Array of non-empty trimmed lines.
 */
function parseLines(stdout: string): string[] {
	return stdout
		.split('\n')
		.map(line => line.trim())
		.filter(line => line.length > 0)
}

/**
 * Validates that a commit SHA exists in the git history of the given directory.
 *
 * @param cwd - Absolute path to the repository root.
 * @param sha - The commit SHA to validate.
 * @throws If the SHA is empty or does not point to a valid commit.
 */
export async function assertCommitExists(cwd: string, sha: string): Promise<void> {
	const trimmed = sha.trim()

	if (!trimmed) {
		throw new Error('Missing --since value.')
	}

	try {
		await Bun.$`git -C ${cwd} cat-file -e ${`${trimmed}^{commit}`}`.quiet()
	} catch {
		throw new Error(`Commit does not exist: ${trimmed}`)
	}
}

/**
 * Returns repo-relative file paths changed since a base commit.
 *
 * Runs `git diff --no-renames --name-only <sha> HEAD`, so a renamed file
 * reports both its old and its new path: a file moved out of a package still
 * marks that package as changed. With `includeWorkingTree`, the diff runs
 * against the working tree instead of HEAD (`git diff --no-renames
 * --name-only <sha>`), and untracked files that aren't ignored are added, so
 * uncommitted edits count too. Paths are normalized to forward slashes,
 * deduplicated and sorted.
 *
 * @param cwd - Absolute path to the repository root.
 * @param sha - Base commit SHA to diff against.
 * @param includeWorkingTree - Also count uncommitted and untracked files.
 * @returns Array of repo-relative changed file paths.
 */
export async function getChangedFilesSince(
	cwd: string,
	sha: string,
	includeWorkingTree: boolean,
): Promise<string[]> {
	if (!includeWorkingTree) {
		const output = await Bun.$`git -C ${cwd} diff --no-renames --name-only ${sha} HEAD`.text()

		return normalizeAll(parseLines(output))
	}

	const diff = await Bun.$`git -C ${cwd} diff --no-renames --name-only ${sha}`.text()
	const untracked = await Bun.$`git -C ${cwd} ls-files --others --exclude-standard`.text()

	return normalizeAll([...parseLines(diff), ...parseLines(untracked)])
}

/**
 * Normalizes, deduplicates and sorts repo-relative paths (byte order, as git lists them).
 *
 * @param files - Raw paths from git output.
 * @returns Unique forward-slash paths in sorted order.
 */
function normalizeAll(files: string[]): string[] {
	return [...new Set(files.map(file => normalizePath(file)))].sort()
}
