#!/usr/bin/env bun
/**
 * Run all workspace checks: typecheck, lint, and format.
 */
import { runTasks } from '../../utils/runner/index.ts'

import type { TaskRunnerConfig } from '../../utils/runner/index.ts'

const EXIT_FAILURE = 1

const config: TaskRunnerConfig = {
	tasks: [
		[
			{
				id: 'typecheck',
				name: 'Typecheck',
				command:
					'rm -f *.tsbuildinfo && bunx -p @typescript/native-preview tsgo --build --noEmit',
			},
			{
				id: 'knip',
				name: 'Unused code',
				command: 'bunx knip-bun',
			},
			{
				id: 'cpd',
				name: 'Copy/paste',
				command: 'bunx jscpd --config jscpd.json .',
			},
		],
		{
			id: 'lint',
			name: 'Lint',
			command: 'bunx oxlint --fix',
		},
		{
			id: 'format',
			name: 'Format',
			command: 'bunx oxfmt',
		},
	],
}

try {
	await runTasks(config)
} catch (error) {
	console.error('')
	console.error(error instanceof Error ? error.message : 'unknown error')
	process.exit(EXIT_FAILURE)
}
