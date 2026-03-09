import { describe, expect, test } from 'bun:test'

import { commitAll, createTempRepo, gitHead, removeTempRepo, runCli, writeRepoFile } from './tests'

/**
 * Creates a temporary repo with a small dependency chain for CLI tests.
 *
 * @returns Absolute path to the temporary repository root.
 */
async function setupCliRepo(): Promise<string> {
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
			{
				relativeDirectory: 'packages/private-core',
				manifest: {
					name: '@acme/private-core',
					version: '1.0.0',
					private: true,
				},
			},
			{
				relativeDirectory: 'packages/public-app',
				manifest: {
					name: '@acme/public-app',
					version: '1.0.0',
					dependencies: {
						'@acme/private-core': 'workspace:*',
					},
				},
			},
		],
	})
}

describe('workspace-affected CLI', () => {
	test('prints help and exits successfully', async () => {
		const result = await runCli(process.cwd(), ['--help'])

		expect(result.exitCode).toBe(0)
		expect(result.stdout).toBe('')
		expect(result.stderr).toContain('workspace-affected')
		expect(result.stderr).toContain('--since <sha>')
	})

	test('fails when --since is missing', async () => {
		const result = await runCli(process.cwd(), [])

		expect(result.exitCode).toBe(1)
		expect(result.stdout).toBe('')
		expect(result.stderr).toContain('Missing required argument: --since')
		expect(result.stderr).toContain('Usage:')
	})

	test('fails when --output is invalid', async () => {
		const result = await runCli(process.cwd(), ['--since', 'abc123', '--output', 'xml'])

		expect(result.exitCode).toBe(1)
		expect(result.stdout).toBe('')
		expect(result.stderr).toContain('Invalid --output value: xml')
	})

	test('prints package names by default', async () => {
		const root = await setupCliRepo()

		try {
			const before = await gitHead(root)

			await writeRepoFile(root, 'packages/a/src.ts', 'export const value = 2;\n')
			await commitAll(root, 'change a')

			const result = await runCli(root, ['--since', before])

			expect(result.exitCode).toBe(0)
			expect(result.stderr).toBe('')
			expect(result.stdout.trim()).toBe('@acme/a\n@acme/b')
		} finally {
			await removeTempRepo(root)
		}
	})

	test('prints repo-relative paths with --output paths', async () => {
		const root = await setupCliRepo()

		try {
			const before = await gitHead(root)

			await writeRepoFile(root, 'packages/a/src.ts', 'export const value = 2;\n')
			await commitAll(root, 'change a')

			const result = await runCli(root, ['--since', before, '--output', 'paths'])

			expect(result.exitCode).toBe(0)
			expect(result.stdout.trim()).toBe('packages/a\npackages/b')
		} finally {
			await removeTempRepo(root)
		}
	})

	test('prints structured JSON with --output json', async () => {
		const root = await setupCliRepo()

		try {
			const before = await gitHead(root)

			await writeRepoFile(root, 'packages/a/src.ts', 'export const value = 2;\n')
			await commitAll(root, 'change a')

			const result = await runCli(root, ['--since', before, '--output', 'json'])
			const parsed = JSON.parse(result.stdout) as Array<Record<string, unknown>>

			expect(result.exitCode).toBe(0)
			expect(parsed).toEqual([
				{
					name: '@acme/a',
					version: '1.0.0',
					path: 'packages/a',
					packageJsonPath: 'packages/a/package.json',
					private: false,
				},
				{
					name: '@acme/b',
					version: '1.0.0',
					path: 'packages/b',
					packageJsonPath: 'packages/b/package.json',
					private: false,
				},
			])
		} finally {
			await removeTempRepo(root)
		}
	})

	test('prints nothing when only non-package files changed', async () => {
		const root = await setupCliRepo()

		try {
			const before = await gitHead(root)

			await writeRepoFile(root, 'README.md', '# changed\n')
			await commitAll(root, 'docs')

			const result = await runCli(root, ['--since', before])

			expect(result.exitCode).toBe(0)
			expect(result.stdout).toBe('')
			expect(result.stderr).toBe('')
		} finally {
			await removeTempRepo(root)
		}
	})

	test('includes private packages only when requested', async () => {
		const root = await setupCliRepo()

		try {
			const before = await gitHead(root)

			await writeRepoFile(root, 'packages/private-core/src.ts', 'export const value = 2;\n')
			await commitAll(root, 'change private core')

			const withoutPrivate = await runCli(root, ['--since', before])
			const withPrivate = await runCli(root, ['--since', before, '--include-private'])

			expect(withoutPrivate.exitCode).toBe(0)
			expect(withoutPrivate.stdout).toBe('')
			expect(withPrivate.exitCode).toBe(0)
			expect(withPrivate.stdout.trim()).toBe('@acme/private-core\n@acme/public-app')
		} finally {
			await removeTempRepo(root)
		}
	})
})
