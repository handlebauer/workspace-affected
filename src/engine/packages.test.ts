import { describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
	discoverWorkspaceDependencies,
	discoverWorkspacePackages,
	mapChangedFilesToPackageNames,
	pickMostSpecificPackageForFile,
} from './packages'

import type { WorkspacePackage } from '../types'

/**
 * Creates a minimal {@link WorkspacePackage} fixture for unit tests.
 *
 * @param name - The package name (e.g. `"@acme/core"`).
 * @param relativeDirectory - Repo-relative directory path (e.g. `"packages/core"`).
 * @returns A fully populated workspace package suitable for pure-function tests.
 */
function pkg(name: string, relativeDirectory: string): WorkspacePackage {
	return {
		name,
		version: '0.0.1',
		private: false,
		manifestPath: `${relativeDirectory}/package.json`,
		relativeManifestPath: `${relativeDirectory}/package.json`,
		directory: relativeDirectory,
		relativeDirectory,
		manifest: {
			name,
			version: '0.0.1',
		},
	}
}

describe('pickMostSpecificPackageForFile', () => {
	test('prefers the most specific matching package path', () => {
		const packages = [
			pkg('@acme/root', 'packages/root'),
			pkg('@acme/root-nested', 'packages/root/nested'),
		]

		const match = pickMostSpecificPackageForFile('packages/root/nested/src/index.ts', packages)

		expect(match?.name).toBe('@acme/root-nested')
	})
})

describe('mapChangedFilesToPackageNames', () => {
	test('maps only files under package paths and dedupes names', () => {
		const packages = [pkg('@acme/a', 'packages/a'), pkg('@acme/b', 'packages/b')]
		const names = mapChangedFilesToPackageNames(
			['README.md', 'packages/a/src/index.ts', 'packages/a/package.json'],
			packages,
		)

		expect(names).toEqual(['@acme/a'])
	})
})

describe('discoverWorkspaceDependencies', () => {
	test('collects workspace protocol references across dependency fields', () => {
		const packages: WorkspacePackage[] = [
			{
				...pkg('@acme/a', 'packages/a'),
				manifest: {
					name: '@acme/a',
					version: '1.0.0',
				},
			},
			{
				...pkg('@acme/b', 'packages/b'),
				manifest: {
					name: '@acme/b',
					version: '1.0.0',
					dependencies: { '@acme/a': 'workspace:^', external: '^1.0.0' },
					devDependencies: { '@acme/a': 'workspace:*' },
					optionalDependencies: { '@acme/missing': 'workspace:*' },
				},
			},
		]

		const dependencies = discoverWorkspaceDependencies(packages)

		expect(dependencies.get('@acme/b')).toEqual(['@acme/a'])
	})
})

describe('discoverWorkspacePackages', () => {
	test('filters private and excluded package manifests by default', async () => {
		const root = await mkdtemp(join(tmpdir(), 'workspace-affected-packages-'))

		try {
			await mkdir(join(root, 'packages', 'a'), { recursive: true })
			await mkdir(join(root, 'packages', 'private'), { recursive: true })
			await mkdir(join(root, 'packages', 'internal', 'x'), { recursive: true })

			await Bun.write(
				join(root, 'packages', 'a', 'package.json'),
				JSON.stringify({ name: '@acme/a', version: '1.0.0' }),
			)
			await Bun.write(
				join(root, 'packages', 'private', 'package.json'),
				JSON.stringify({ name: '@acme/private', version: '1.0.0', private: true }),
			)
			await Bun.write(
				join(root, 'packages', 'internal', 'x', 'package.json'),
				JSON.stringify({ name: '@acme/internal-x', version: '1.0.0' }),
			)

			const publishable = await discoverWorkspacePackages({
				cwd: root,
				packagesGlob: 'packages/**/package.json',
				includePrivate: false,
				excludePathGlobs: ['**/internal/**'],
			})

			expect(publishable.map(item => item.name)).toEqual(['@acme/a'])

			const withPrivate = await discoverWorkspacePackages({
				cwd: root,
				packagesGlob: 'packages/**/package.json',
				includePrivate: true,
				excludePathGlobs: [],
			})

			expect(withPrivate.map(item => item.name)).toEqual([
				'@acme/a',
				'@acme/internal-x',
				'@acme/private',
			])
		} finally {
			await rm(root, { recursive: true, force: true })
		}
	})
})
