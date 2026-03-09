import { describe, expect, test } from 'bun:test'

import { assertCommitExists, getChangedFilesSince } from './git'
import { commitAll, createTempRepo, gitHead, removeTempRepo, writeRepoFile } from '../tests'

describe('assertCommitExists', () => {
	test('rejects blank commit values', async () => {
		await expect(assertCommitExists(process.cwd(), '   ')).rejects.toThrow('Missing --since value.')
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

			const changedFiles = await getChangedFilesSince(root, before)

			expect(changedFiles).toEqual(['README.md', 'packages/a/src.ts'])
		} finally {
			await removeTempRepo(root)
		}
	})
})
