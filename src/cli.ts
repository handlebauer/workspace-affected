#!/usr/bin/env bun

import { resolve } from 'node:path'
import { parseArgs as parseNodeArgs } from 'node:util'

import { discoverAffectedPackages } from './engine'
import { fmt } from './utils'

import type { WorkspacePackage } from './types'

type OutputMode = 'names' | 'paths' | 'json'

interface CliOptions {
	since?: string
	cwd: string
	packages: string
	exclude: string[]
	includePrivate: boolean
	output: OutputMode
	changedOnly: boolean
	help: boolean
}

const DEFAULT_PACKAGES_GLOB = 'packages/**/package.json'

const { bold, dim, cyan, green } = fmt

/**
 * Writes formatted usage/help text to stderr.
 *
 * Uses ANSI colors when stderr is a TTY, plain text otherwise.
 */
function printUsage(): void {
	process.stderr.write(
		`${bold('workspace-affected')} — detect affected workspace packages

${green('Usage:')} ${bold('workspace-affected')} ${dim('--since <sha> [options]')}

${green('Required:')}
  ${cyan('--since')} ${dim('<sha>')}             Base commit SHA

${green('Options:')}
  ${cyan('--cwd')} ${dim('<path>')}              Repository root ${dim('(default: cwd)')}
  ${cyan('--packages')} ${dim('<glob>')}         Workspace manifest glob ${dim(`(default: ${DEFAULT_PACKAGES_GLOB})`)}
  ${cyan('--exclude')} ${dim('<glob>')}          Exclude manifest paths matching glob ${dim('(repeatable)')}
  ${cyan('--include-private')}          Include private packages
  ${cyan('--output')} ${dim('<mode>')}           ${cyan('names')} | ${cyan('paths')} | ${cyan('json')} ${dim('(default: names)')}
  ${cyan('--changed-only')}             Skip dependent expansion, only direct changes
  ${cyan('-h')}, ${cyan('--help')}               Show this message

${green('Examples:')}
  ${dim('$')} ${bold('workspace-affected')} ${cyan('--since')} abc1234
  ${dim('$')} ${bold('workspace-affected')} ${cyan('--since')} abc1234 ${cyan('--output')} json
  ${dim('$')} ${bold('workspace-affected')} ${cyan('--since')} abc1234 ${cyan('--exclude')} ${dim("'**/internal/**'")}
  ${dim('$')} ${bold('workspace-affected')} ${cyan('--since')} "$BEFORE_SHA" ${cyan('--changed-only')}
`,
	)
}

/**
 * Parses raw CLI arguments into a typed options object using `node:util`'s
 * `parseArgs`.
 *
 * @param argv - The argument array (typically `process.argv.slice(2)`).
 * @returns Validated CLI options ready for the orchestrator.
 * @throws If an unknown flag is passed or `--output` has an invalid value.
 */
function parseArgs(argv: string[]): CliOptions {
	const parsed = parseNodeArgs({
		args: argv,
		strict: true,
		allowPositionals: false,
		options: {
			since: { type: 'string' },
			cwd: { type: 'string', default: process.cwd() },
			packages: { type: 'string', default: DEFAULT_PACKAGES_GLOB },
			exclude: { type: 'string', multiple: true, default: [] },
			'include-private': { type: 'boolean', default: false },
			output: { type: 'string', default: 'names' },
			'changed-only': { type: 'boolean', default: false },
			help: { type: 'boolean', short: 'h', default: false },
		},
	})

	const output = parsed.values.output as string

	if (!['names', 'paths', 'json'].includes(output)) {
		throw new Error(`Invalid --output value: ${output}`)
	}

	return {
		since: parsed.values.since,
		cwd: parsed.values.cwd ?? process.cwd(),
		packages: parsed.values.packages ?? DEFAULT_PACKAGES_GLOB,
		exclude: parsed.values.exclude ?? [],
		includePrivate: parsed.values['include-private'] ?? false,
		output: output as OutputMode,
		changedOnly: parsed.values['changed-only'] ?? false,
		help: parsed.values.help ?? false,
	}
}

/**
 * Formats an array of affected packages into the requested output format.
 *
 * @param packages - Affected workspace packages to format.
 * @param output - The target format: `"names"`, `"paths"`, or `"json"`.
 * @returns Formatted string ready for stdout.
 */
function formatOutput(packages: WorkspacePackage[], output: OutputMode): string {
	if (output === 'json') {
		return JSON.stringify(
			packages.map(pkg => ({
				name: pkg.name,
				version: pkg.version,
				path: pkg.relativeDirectory,
				packageJsonPath: pkg.relativeManifestPath,
				private: pkg.private,
			})),
			null,
			2,
		)
	}

	if (output === 'paths') {
		return packages.map(pkg => pkg.relativeDirectory).join('\n')
	}

	return packages.map(pkg => pkg.name).join('\n')
}

/**
 * CLI entry point. Parses arguments, runs the affected package discovery
 * pipeline, and prints the result to stdout.
 *
 * Exits `0` on success (including empty output) and `1` on any error.
 */
async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2))

	if (options.help) {
		printUsage()
		process.exit(0)
	}

	if (!options.since) {
		throw new Error('Missing required argument: --since')
	}

	const affected = await discoverAffectedPackages({
		since: options.since,
		cwd: resolve(options.cwd),
		packagesGlob: options.packages,
		excludePathGlobs: options.exclude,
		includePrivate: options.includePrivate,
		changedOnly: options.changedOnly,
	})

	const out = formatOutput(affected, options.output)

	if (out.length > 0) {
		console.log(out)
	}
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error)

	process.stderr.write(`${message}\n\n`)
	printUsage()
	process.exit(1)
})
