import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { createTempRepo, gitHead, removeTempRepo, runCli, writeRepoFile } from './tests'

describe('tests helpers', () => {
	test('createTempRepo seeds package and file fixtures', async () => {
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
			const manifest = await Bun.file(join(root, 'packages/a/package.json')).json()
			const sourceText = await readFile(join(root, 'packages/a/src.ts'), 'utf8')
			const readmeText = await readFile(join(root, 'README.md'), 'utf8')
			const head = await gitHead(root)

			expect(manifest).toEqual({
				name: '@acme/a',
				version: '1.0.0',
			})
			expect(sourceText).toBe('export const value = 1\n')
			expect(readmeText).toBe('# temp\n')
			expect(head.length).toBeGreaterThan(0)
		} finally {
			await removeTempRepo(root)
		}
	})

	test('writeRepoFile creates parent directories automatically', async () => {
		const root = await createTempRepo({
			files: {
				'README.md': '# temp\n',
			},
		})

		try {
			await writeRepoFile(root, 'nested/deep/file.txt', 'hello\n')

			const text = await readFile(join(root, 'nested/deep/file.txt'), 'utf8')

			expect(text).toBe('hello\n')
		} finally {
			await removeTempRepo(root)
		}
	})

	test('runCli captures stdout, stderr, and exit code', async () => {
		const result = await runCli(process.cwd(), ['--help'])

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toBe('')
		expect(result.stderr).toContain('workspace-affected')
	})
})
