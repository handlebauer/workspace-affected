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
 * Returns repo-relative file paths changed between a base commit and HEAD.
 *
 * Runs `git diff --name-only <sha> HEAD` and normalizes the output paths
 * to use forward slashes.
 *
 * @param cwd - Absolute path to the repository root.
 * @param sha - Base commit SHA to diff against HEAD.
 * @returns Array of repo-relative changed file paths.
 */
export async function getChangedFilesSince(cwd: string, sha: string): Promise<string[]> {
	const output = await Bun.$`git -C ${cwd} diff --name-only ${sha} HEAD`.text()

	return parseLines(output).map(file => normalizePath(file))
}
