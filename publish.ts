#!/usr/bin/env bun
import { readFile } from 'node:fs/promises'

import { $ } from 'bun'

import { runStep } from './scripts/utils/common'

interface PackageJson {
	name: string
	version: string
}

/**
 * Reads and parses the local package.json.
 *
 * @returns Parsed package manifest
 */
async function readPackageJson(): Promise<PackageJson> {
	const raw = await readFile('./package.json', 'utf8')

	return JSON.parse(raw) as PackageJson
}

/**
 * Returns the currently published version, or null if unpublished.
 *
 * @param name - npm package name to look up
 * @returns Published version string, or null if not found
 */
async function getPublishedVersion(name: string): Promise<string | null> {
	const proc = Bun.spawn(['npm', 'view', name, 'version'], {
		stderr: 'ignore',
		stdout: 'pipe',
	})

	const output = await new Response(proc.stdout).text()
	const code = await proc.exited
	const EXIT_SUCCESS = 0

	if (code !== EXIT_SUCCESS) {
		return null
	}

	return output.trim()
}

const pkg = await readPackageJson()
const { name, version } = pkg

const args = process.argv.slice(2) // eslint-disable-line no-magic-numbers
const dryRun = args.includes('--dry-run')

const published = await runStep(
	'Checking npm registry',
	() => getPublishedVersion(name),
	result => (result ? `Latest published: v${result}` : 'Not yet published'),
)

if (published === version) {
	await runStep(`v${version} already published`)
	process.exit(0) // eslint-disable-line no-magic-numbers
}

await runStep('Building', () => $`bun run build`.quiet(), 'Built')

await runStep(
	`Publishing v${version}`,
	() => {
		const cmd = dryRun
			? $`npm publish --access public --tag latest --provenance --dry-run`
			: $`npm publish --access public --tag latest --provenance`

		return cmd.quiet()
	},
	`Published ${name}@${version}${dryRun ? ' (dry run)' : ''}`,
)

await runStep('Done!')
