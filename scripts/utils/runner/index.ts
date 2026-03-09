#!/usr/bin/env bun
import { loadConfig } from './config.ts'
import { runTasks } from './runner.ts'
export { loadConfig, resolveConfigPath } from './config.ts'
export { runTasks } from './runner.ts'
export type { RunTasksOptions, TaskDef, TaskResult, TaskRunnerConfig, TaskStep } from './types.ts'

const EXIT_FAILURE = 1
const CONFIG_FLAG = '--config'
const ARGV_OFFSET = 2
const MISSING_INDEX = -1
const NEXT_OFFSET = 1

/**
 * Extract the config file path from CLI arguments (--config <path>).
 *
 * @param argv - Command-line arguments (e.g. process.argv.slice(2))
 * @returns The config path if --config was provided, otherwise undefined
 * @throws Error if --config is present but no value follows
 */
function parseCliConfigPath(argv: string[]): string | undefined {
	const flagIndex = argv.indexOf(CONFIG_FLAG)

	if (flagIndex === MISSING_INDEX) {
		return undefined
	}

	const value = argv[flagIndex + NEXT_OFFSET]

	if (!value) {
		throw new Error(`${CONFIG_FLAG} requires a value`)
	}

	return value
}

if (import.meta.main) {
	try {
		const configPath = parseCliConfigPath(process.argv.slice(ARGV_OFFSET))
		const config = await loadConfig(configPath)

		await runTasks(config)
	} catch (error) {
		console.error('')
		console.error(error instanceof Error ? error.message : 'unknown error')
		process.exit(EXIT_FAILURE)
	}
}
