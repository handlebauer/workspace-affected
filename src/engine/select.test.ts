import { describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { discoverAffectedPackages } from './select'

/**
 * Scaffolds a package directory with a `package.json` and a dummy source file
 * inside a temporary git repo.
 *
 * @param root - Absolute path to the temporary repo root.
 * @param relativeDirectory - Repo-relative directory for the package (e.g. `"packages/a"`).
 * @param manifest - Contents to write as `package.json`.
 */
async function writePackage(
	root: string,
	relativeDirectory: string,
	manifest: Record<string, unknown>,
): Promise<void> {
	const directory = join(root, relativeDirectory)

	await mkdir(directory, { recursive: true })
	await Bun.write(join(directory, 'package.json'), JSON.stringify(manifest, null, 2))
	await Bun.write(join(directory, 'src.ts'), 'export const value = 1;\n')
}

/**
 * Returns the full SHA of HEAD in the given repo.
 *
 * @param root - Absolute path to the repository root.
 * @returns The HEAD commit SHA, trimmed.
 */
async function gitHead(root: string): Promise<string> {
	const value = await Bun.$`git -C ${root} rev-parse HEAD`.text()

	return value.trim()
}

/**
 * Stages all files and creates a commit in the given repo.
 *
 * @param root - Absolute path to the repository root.
 * @param message - Commit message.
 */
async function commitAll(root: string, message: string): Promise<void> {
	await Bun.$`git -C ${root} add .`
	await Bun.$`git -C ${root} -c user.name=bot -c user.email=bot@example.com commit -m ${message}`
}

/**
 * Creates a temporary git repo with two packages (`@acme/a` and `@acme/b`)
 * where `@acme/b` depends on `@acme/a` via `workspace:*`.
 *
 * @returns Absolute path to the temporary repo root. Caller must clean up.
 */
async function setupRepo(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), 'workspace-affected-it-'))

	await Bun.$`git -C ${root} init`
	await writePackage(root, 'packages/a', {
		name: '@acme/a',
		version: '1.0.0',
	})
	await writePackage(root, 'packages/b', {
		name: '@acme/b',
		version: '1.0.0',
		dependencies: {
			'@acme/a': 'workspace:*',
		},
	})
	await Bun.write(join(root, 'README.md'), '# temp\n')
	await commitAll(root, 'initial')

	return root
}

describe('discoverAffectedPackages integration', () => {
	test('returns changed package plus dependent package', async () => {
		const root = await setupRepo()

		try {
			const before = await gitHead(root)

			await Bun.write(join(root, 'packages', 'a', 'src.ts'), 'export const value = 2;\n')
			await commitAll(root, 'change a')

			const affected = await discoverAffectedPackages({
				since: before,
				cwd: root,
				packagesGlob: 'packages/**/package.json',
				excludePathGlobs: [],
				includePrivate: false,
				changedOnly: false,
			})

			expect(affected.map(pkg => pkg.name)).toEqual(['@acme/a', '@acme/b'])
		} finally {
			await rm(root, { recursive: true, force: true })
		}
	})

	test('returns empty when no package files changed', async () => {
		const root = await setupRepo()

		try {
			const before = await gitHead(root)

			await Bun.write(join(root, 'README.md'), '# changed\n')
			await commitAll(root, 'docs')

			const affected = await discoverAffectedPackages({
				since: before,
				cwd: root,
				packagesGlob: 'packages/**/package.json',
				excludePathGlobs: [],
				includePrivate: false,
				changedOnly: false,
			})

			expect(affected).toEqual([])
		} finally {
			await rm(root, { recursive: true, force: true })
		}
	})

	test('returns empty on no-op diff', async () => {
		const root = await setupRepo()

		try {
			const head = await gitHead(root)
			const affected = await discoverAffectedPackages({
				since: head,
				cwd: root,
				packagesGlob: 'packages/**/package.json',
				excludePathGlobs: [],
				includePrivate: false,
				changedOnly: false,
			})

			expect(affected).toEqual([])
		} finally {
			await rm(root, { recursive: true, force: true })
		}
	})

	test('supports changed-only mode', async () => {
		const root = await setupRepo()

		try {
			const before = await gitHead(root)

			await Bun.write(join(root, 'packages', 'a', 'src.ts'), 'export const changed = true;\n')
			await commitAll(root, 'change a')

			const affected = await discoverAffectedPackages({
				since: before,
				cwd: root,
				packagesGlob: 'packages/**/package.json',
				excludePathGlobs: [],
				includePrivate: false,
				changedOnly: true,
			})

			expect(affected.map(pkg => pkg.name)).toEqual(['@acme/a'])
		} finally {
			await rm(root, { recursive: true, force: true })
		}
	})

	test('throws for invalid sha', async () => {
		const root = await setupRepo()

		try {
			await expect(
				discoverAffectedPackages({
					since: 'deadbeef',
					cwd: root,
					packagesGlob: 'packages/**/package.json',
					excludePathGlobs: [],
					includePrivate: false,
					changedOnly: false,
				}),
			).rejects.toThrow('Commit does not exist')
		} finally {
			await rm(root, { recursive: true, force: true })
		}
	})
})
