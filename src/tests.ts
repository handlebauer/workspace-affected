import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type TestPackageFixture = Readonly<{
	manifest: Record<string, unknown>
	relativeDirectory: string
	sourceText?: string
}>

type CreateTempRepoOptions = Readonly<{
	files?: Readonly<Record<string, string>>
	packages?: readonly TestPackageFixture[]
}>

type CliResult = Readonly<{
	exitCode: number
	stderr: string
	stdout: string
}>

const DEFAULT_SOURCE_TEXT = 'export const value = 1\n'

const CLEAN_GIT_ENV = {
	GIT_AUTHOR_DATE: undefined,
	GIT_DIR: undefined,
	GIT_INDEX_FILE: undefined,
	GIT_WORK_TREE: undefined,
}

/**
 * Writes a text file relative to a repository root, creating parent directories.
 *
 * @param root - Absolute path to the repository root.
 * @param relativePath - Repo-relative file path.
 * @param contents - File contents to write.
 * @returns Resolves when the file has been written.
 */
export async function writeRepoFile(
	root: string,
	relativePath: string,
	contents: string,
): Promise<void> {
	const absolutePath = join(root, relativePath)

	await mkdir(join(absolutePath, '..'), { recursive: true })
	await Bun.write(absolutePath, contents)
}

/**
 * Writes a workspace package fixture into a temporary repository.
 *
 * @param root - Absolute path to the repository root.
 * @param fixture - Package fixture definition.
 * @returns Resolves when the package files have been written.
 */
async function writeWorkspacePackage(root: string, fixture: TestPackageFixture): Promise<void> {
	const directory = join(root, fixture.relativeDirectory)

	await mkdir(directory, { recursive: true })
	await Bun.write(join(directory, 'package.json'), JSON.stringify(fixture.manifest, null, 2))
	await Bun.write(join(directory, 'src.ts'), fixture.sourceText ?? DEFAULT_SOURCE_TEXT)
}

/**
 * Stages all files and creates a git commit in the temporary repository.
 *
 * @param root - Absolute path to the temporary repository root.
 * @param message - Commit message to create.
 * @returns Resolves when the commit has been created.
 */
export async function commitAll(root: string, message: string): Promise<void> {
	await Bun.$`git -C ${root} add .`.env(CLEAN_GIT_ENV)
	await Bun.$`git -C ${root} -c user.name=bot -c user.email=bot@example.com commit -m ${message}`.env(
		CLEAN_GIT_ENV,
	)
}

/**
 * Returns the current HEAD SHA for the given repository.
 *
 * @param root - Absolute path to the repository root.
 * @returns The trimmed HEAD commit SHA.
 */
export async function gitHead(root: string): Promise<string> {
	const value = await Bun.$`git -C ${root} rev-parse HEAD`.env(CLEAN_GIT_ENV).text()

	return value.trim()
}

/**
 * Creates a disposable git repository populated with optional packages and files.
 *
 * The repository is initialized and committed once before being returned.
 *
 * @param options - Package and file fixtures to seed the repository with.
 * @returns Absolute path to the repository root.
 */
export async function createTempRepo(options: CreateTempRepoOptions = {}): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'workspace-affected-test-'))

	await Bun.$`git -C ${root} init`.env(CLEAN_GIT_ENV)

	for (const fixture of options.packages ?? []) {
		await writeWorkspacePackage(root, fixture)
	}

	for (const [relativePath, contents] of Object.entries(options.files ?? {})) {
		await writeRepoFile(root, relativePath, contents)
	}

	await commitAll(root, 'initial')

	return root
}

/**
 * Removes a temporary repository created for a test.
 *
 * @param root - Absolute path to the repository root.
 * @returns Resolves when the directory has been deleted.
 */
export async function removeTempRepo(root: string): Promise<void> {
	await rm(root, { recursive: true, force: true })
}

/**
 * Runs the CLI entrypoint against a repository fixture and captures output.
 *
 * @param cwd - Working directory to run the CLI in.
 * @param args - Command-line arguments to pass to the CLI.
 * @returns Captured exit code, stdout, and stderr.
 */
export async function runCli(cwd: string, args: string[]): Promise<CliResult> {
	const cliPath = new URL('cli.ts', import.meta.url)
	const proc = Bun.spawn([process.execPath, cliPath.pathname, ...args], {
		cwd,
		stderr: 'pipe',
		stdout: 'pipe',
	})
	const [exitCode, stdout, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	])

	return {
		exitCode,
		stderr,
		stdout,
	}
}
