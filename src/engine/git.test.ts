import { describe, expect, test } from 'bun:test'
import { rename } from 'node:fs/promises'
import { join } from 'node:path'

import { commitAll, createTempRepo, gitHead, removeTempRepo, writeRepoFile } from '../tests'
import { assertCommitExists, getChangedFilesSince } from './git'

describe('assertCommitExists', () => {
	test('rejects blank commit values', async () => {
		await expect(assertCommitExists(process.cwd(), '   ')).rejects.toThrow(
			'Missing --since value.',
		)
	})
})

describe('getChangedFilesSince', () => {
	test('returns normalized repo-relative changed file paths', async () => {
		const root = await createTempRepo({
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
			],
		})

		try {
			const before = await gitHead(root)

			await writeRepoFile(root, 'packages/a/src.ts', 'export const value = 2;\n')
			await writeRepoFile(root, 'README.md', '# changed\n')
			await commitAll(root, 'change files')

			const changedFiles = await getChangedFilesSince(root, before, false)

			expect(changedFiles).toEqual(['README.md', 'packages/a/src.ts'])
		} finally {
			await removeTempRepo(root)
		}
	})
})

/** A repo with two packages, so a move between them shows both sides. */
const TWO_PACKAGES = {
	files: {
		'packages/a/moved.ts': 'export const moved = 1;\n',
	},
	packages: [
		{ relativeDirectory: 'packages/a', manifest: { name: '@acme/a', version: '1.0.0' } },
		{ relativeDirectory: 'packages/b', manifest: { name: '@acme/b', version: '1.0.0' } },
	],
}

describe('getChangedFilesSince renames', () => {
	test('reports a moved file at both its old and its new path', async () => {
		const root = await createTempRepo(TWO_PACKAGES)

		try {
			const before = await gitHead(root)

			await rename(join(root, 'packages/a/moved.ts'), join(root, 'packages/b/moved.ts'))
			await commitAll(root, 'move a file from a to b')

			expect(await getChangedFilesSince(root, before, false)).toEqual([
				'packages/a/moved.ts',
				'packages/b/moved.ts',
			])
		} finally {
			await removeTempRepo(root)
		}
	})
})

describe('getChangedFilesSince with the working tree', () => {
	test('ignores uncommitted and untracked files by default', async () => {
		const root = await createTempRepo(TWO_PACKAGES)

		try {
			const before = await gitHead(root)

			await writeRepoFile(root, 'packages/a/moved.ts', 'export const moved = 2;\n')
			await writeRepoFile(root, 'packages/b/new.ts', 'export const fresh = 1;\n')

			expect(await getChangedFilesSince(root, before, false)).toEqual([])
		} finally {
			await removeTempRepo(root)
		}
	})

	test('counts committed, uncommitted and untracked changes once each', async () => {
		const root = await createTempRepo(TWO_PACKAGES)

		try {
			const before = await gitHead(root)

			await writeRepoFile(root, 'packages/b/committed.ts', 'export const done = 1;\n')
			await commitAll(root, 'commit a change in b')
			await writeRepoFile(root, 'packages/a/moved.ts', 'export const moved = 2;\n')
			await writeRepoFile(root, 'packages/b/committed.ts', 'export const done = 2;\n')
			await writeRepoFile(root, 'packages/b/new.ts', 'export const fresh = 1;\n')

			expect(await getChangedFilesSince(root, before, true)).toEqual([
				'packages/a/moved.ts',
				'packages/b/committed.ts',
				'packages/b/new.ts',
			])
		} finally {
			await removeTempRepo(root)
		}
	})

	test('leaves out ignored files', async () => {
		const root = await createTempRepo(TWO_PACKAGES)

		try {
			await writeRepoFile(root, '.gitignore', 'dist/\n')
			await commitAll(root, 'ignore dist')

			const before = await gitHead(root)

			await writeRepoFile(root, 'packages/a/dist/out.js', 'export {};\n')

			expect(await getChangedFilesSince(root, before, true)).toEqual([])
		} finally {
			await removeTempRepo(root)
		}
	})
})
