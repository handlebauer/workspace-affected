import { describe, expect, test } from 'bun:test'

import { discoverAffectedPackages } from './select'
import {
	commitAll,
	createTempRepo,
	gitHead,
	removeTempRepo,
	writeRepoFile,
} from '../tests'

/**
 * Creates a temporary git repo with a simple two-package dependency chain.
 *
 * `@acme/b` depends on `@acme/a` via `workspace:*`.
 *
 * @returns Absolute path to the temporary repo root.
 */
async function setupRepo(): Promise<string> {
	return createTempRepo({
		files: {
			'README.md': '# temp\n',
		},
		packages: [
			{
				relativeDirectory: 'packages/a',
				manifest: {
					name: '@acme/a',
					version: '1.0.0',
				},
			},
			{
				relativeDirectory: 'packages/b',
				manifest: {
					name: '@acme/b',
					version: '1.0.0',
					dependencies: {
						'@acme/a': 'workspace:*',
					},
				},
			},
		],
	})
}

describe('discoverAffectedPackages integration', () => {
	test('returns changed package plus dependent package', async () => {
		const root = await setupRepo()

		try {
			const before = await gitHead(root)

			await writeRepoFile(root, 'packages/a/src.ts', 'export const value = 2;\n')
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
			await removeTempRepo(root)
		}
	})

	test('returns empty when no package files changed', async () => {
		const root = await setupRepo()

		try {
			const before = await gitHead(root)

			await writeRepoFile(root, 'README.md', '# changed\n')
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
			await removeTempRepo(root)
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
			await removeTempRepo(root)
		}
	})

	test('supports changed-only mode', async () => {
		const root = await setupRepo()

		try {
			const before = await gitHead(root)

			await writeRepoFile(root, 'packages/a/src.ts', 'export const changed = true;\n')
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
			await removeTempRepo(root)
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
			await removeTempRepo(root)
		}
	})

	test('includes private packages when requested and expands to dependents', async () => {
		const root = await createTempRepo({
			packages: [
				{
					relativeDirectory: 'packages/core',
					manifest: {
						name: '@acme/core',
						version: '1.0.0',
						private: true,
					},
				},
				{
					relativeDirectory: 'packages/app',
					manifest: {
						name: '@acme/app',
						version: '1.0.0',
						dependencies: {
							'@acme/core': 'workspace:*',
						},
					},
				},
			],
		})

		try {
			const before = await gitHead(root)

			await writeRepoFile(root, 'packages/core/src.ts', 'export const value = 2;\n')
			await commitAll(root, 'change core')

			const withoutPrivate = await discoverAffectedPackages({
				since: before,
				cwd: root,
				packagesGlob: 'packages/**/package.json',
				excludePathGlobs: [],
				includePrivate: false,
				changedOnly: false,
			})

			expect(withoutPrivate).toEqual([])

			const withPrivate = await discoverAffectedPackages({
				since: before,
				cwd: root,
				packagesGlob: 'packages/**/package.json',
				excludePathGlobs: [],
				includePrivate: true,
				changedOnly: false,
			})

			expect(withPrivate.map(pkg => pkg.name)).toEqual(['@acme/core', '@acme/app'])
		} finally {
			await removeTempRepo(root)
		}
	})

	test('respects exclude globs end to end', async () => {
		const root = await createTempRepo({
			packages: [
				{
					relativeDirectory: 'packages/public',
					manifest: {
						name: '@acme/public',
						version: '1.0.0',
					},
				},
				{
					relativeDirectory: 'packages/internal/secret',
					manifest: {
						name: '@acme/secret',
						version: '1.0.0',
					},
				},
			],
		})

		try {
			const before = await gitHead(root)

			await writeRepoFile(root, 'packages/internal/secret/src.ts', 'export const value = 2;\n')
			await commitAll(root, 'change secret')

			const affected = await discoverAffectedPackages({
				since: before,
				cwd: root,
				packagesGlob: 'packages/**/package.json',
				excludePathGlobs: ['**/internal/**'],
				includePrivate: false,
				changedOnly: false,
			})

			expect(affected).toEqual([])
		} finally {
			await removeTempRepo(root)
		}
	})

	test('dedupes shared dependents across multiple changed roots', async () => {
		const root = await createTempRepo({
			packages: [
				{
					relativeDirectory: 'packages/a',
					manifest: {
						name: '@acme/a',
						version: '1.0.0',
					},
				},
				{
					relativeDirectory: 'packages/b',
					manifest: {
						name: '@acme/b',
						version: '1.0.0',
					},
				},
				{
					relativeDirectory: 'packages/c',
					manifest: {
						name: '@acme/c',
						version: '1.0.0',
						dependencies: {
							'@acme/a': 'workspace:*',
							'@acme/b': 'workspace:*',
						},
					},
				},
				{
					relativeDirectory: 'packages/d',
					manifest: {
						name: '@acme/d',
						version: '1.0.0',
						dependencies: {
							'@acme/c': 'workspace:*',
						},
					},
				},
			],
		})

		try {
			const before = await gitHead(root)

			await writeRepoFile(root, 'packages/a/src.ts', 'export const a = 2;\n')
			await writeRepoFile(root, 'packages/b/src.ts', 'export const b = 2;\n')
			await commitAll(root, 'change a and b')

			const affected = await discoverAffectedPackages({
				since: before,
				cwd: root,
				packagesGlob: 'packages/**/package.json',
				excludePathGlobs: [],
				includePrivate: false,
				changedOnly: false,
			})

			expect(affected.map(pkg => pkg.name)).toEqual([
				'@acme/a',
				'@acme/b',
				'@acme/c',
				'@acme/d',
			])
		} finally {
			await removeTempRepo(root)
		}
	})

	test('returns empty when no workspace packages are discovered', async () => {
		const root = await createTempRepo({
			files: {
				'README.md': '# temp\n',
			},
		})

		try {
			const before = await gitHead(root)

			await writeRepoFile(root, 'README.md', '# changed\n')
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
			await removeTempRepo(root)
		}
	})
})
