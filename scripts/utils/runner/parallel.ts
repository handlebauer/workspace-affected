import { formatTaskResultText } from '../common/format.ts'
import { isInteractive, SpinnerGroup } from '../common/spinner.ts'
import { runCommand } from './command.ts'

import type { TaskDef, TaskResult } from './types.ts'

const CHECK_MARK = '\u2714'
const CROSS_MARK = '\u2716'
const CANCEL_MARK = '\u25CB'
const ABORT_EXIT_CODE = -2

type ShellError = Error &
	Readonly<{
		exitCode: number
		stderr: Buffer
		stdout: Buffer
	}>

type TaskOutcome = Readonly<{
	cancelled: boolean
	error?: unknown
	label: string
	result: TaskResult
	task: TaskDef
}>

/**
 * Get the display label for a task (custom name or id).
 *
 * @param task - Task definition
 * @returns Human-readable label for logging
 */
function getTaskLabel(task: TaskDef): string {
	const customName = task.name?.trim()

	if (customName) {
		return customName
	}

	return task.id
}

/**
 * Execute a single task command with optional abort signal.
 *
 * @param task - Task definition to execute
 * @param signal - Optional abort signal for cancellation
 */
async function executeTask(task: TaskDef, signal?: AbortSignal): Promise<void> {
	await runCommand(task.command, task.timeoutMs, signal)
}

/**
 * Check whether an error carries shell output (stderr/stdout).
 *
 * @param error - Error to check
 * @returns True if error is a ShellError
 */
function isShellError(error: unknown): error is ShellError {
	return error instanceof Error && 'exitCode' in error && 'stderr' in error && 'stdout' in error
}

/**
 * Check whether an error represents an aborted task.
 *
 * @param error - Error to check
 * @returns True if the error was caused by abort
 */
function isAbortError(error: unknown): boolean {
	return isShellError(error) && error.exitCode === ABORT_EXIT_CODE
}

/**
 * Log structured details from a shell error.
 *
 * @param error - Shell error with exit code and output buffers
 */
function logShellError(error: ShellError): void {
	console.error(`  Exit Code: ${String(error.exitCode)}`)

	const stdout = error.stdout.toString().trim()
	const stderr = error.stderr.toString().trim()

	if (stdout) {
		console.error('  Stdout:')
		console.error(
			stdout
				.split('\n')
				.map(line => `    ${line}`)
				.join('\n'),
		)
	}

	if (stderr) {
		console.error('  Stderr:')
		console.error(
			stderr
				.split('\n')
				.map(line => `    ${line}`)
				.join('\n'),
		)
	}
}

/**
 * Print outcomes for parallel tasks in non-interactive (non-TTY) mode.
 *
 * @param outcomes - Completed task outcomes
 */
function printNonInteractiveParallelOutcomes(outcomes: readonly TaskOutcome[]): void {
	for (const outcome of outcomes) {
		if (outcome.cancelled) {
			const text = formatTaskResultText({
				cancelled: true,
				durationMs: outcome.result.durationMs,
				label: outcome.label,
				ok: false,
			})

			console.log(`${CANCEL_MARK} ${text}`)
		} else {
			const symbol = outcome.result.ok ? CHECK_MARK : CROSS_MARK
			const text = formatTaskResultText({
				durationMs: outcome.result.durationMs,
				includeFailurePrefix: true,
				label: outcome.label,
				ok: outcome.result.ok,
			})

			console.log(`${symbol} ${text}`)
		}
	}
}

/**
 * Execute a group of tasks in parallel with spinner display.
 *
 * On first real failure (allowFailure=false), remaining running tasks are
 * cancelled via AbortSignal. Results for all tasks are returned.
 *
 * @param tasks - Array of task definitions to run concurrently
 * @returns Array of outcomes for each task
 * @throws Error when any non-allowFailure task fails
 */
export async function executeParallelTasks(tasks: readonly TaskDef[]): Promise<TaskOutcome[]> {
	const labels = tasks.map(getTaskLabel)
	const interactive = isInteractive()
	const spinnerGroup = interactive ? new SpinnerGroup(labels) : undefined
	const controllers = tasks.map(() => new AbortController())
	const settled = tasks.map(() => false)
	let cancellationTriggered = false

	spinnerGroup?.start()

	const outcomes = await Promise.all(
		tasks.map(async (task, index): Promise<TaskOutcome> => {
			const label = labels[index] ?? task.id
			const startedAt = Date.now()

			try {
				await executeTask(task, controllers[index]?.signal)

				const result: TaskResult = {
					durationMs: Date.now() - startedAt,
					id: task.id,
					ok: true,
				}

				spinnerGroup?.update(
					index,
					'success',
					formatTaskResultText({
						durationMs: result.durationMs,
						label,
						ok: true,
					}),
				)
				settled[index] = true

				return { cancelled: false, label, result, task }
			} catch (error) {
				const cancelled = isAbortError(error)
				const result: TaskResult = {
					durationMs: Date.now() - startedAt,
					id: task.id,
					ok: false,
				}

				spinnerGroup?.update(
					index,
					cancelled ? 'cancelled' : 'error',
					formatTaskResultText({
						cancelled,
						durationMs: result.durationMs,
						label,
						ok: false,
					}),
				)
				settled[index] = true

				if (!cancelled && task.allowFailure !== true && cancellationTriggered === false) {
					cancellationTriggered = true

					for (
						let controllerIndex = 0;
						controllerIndex < controllers.length;
						controllerIndex += 1
					) {
						if (controllerIndex !== index && settled[controllerIndex] !== true) {
							controllers[controllerIndex]?.abort()
						}
					}
				}

				return { cancelled, error, label, result, task }
			}
		}),
	)

	spinnerGroup?.stop()

	if (!interactive) {
		printNonInteractiveParallelOutcomes(outcomes)
	}

	const realFailures: TaskOutcome[] = []

	for (const outcome of outcomes) {
		if (!outcome.result.ok && !outcome.cancelled) {
			if (outcome.task.allowFailure === true) {
				console.error(`Warning: task failed but allowFailure=true (${outcome.label})`)

				if (isShellError(outcome.error)) {
					logShellError(outcome.error)
				} else {
					console.error(
						`  ${outcome.error instanceof Error ? outcome.error.message : String(outcome.error)}`,
					)
				}
			} else {
				realFailures.push(outcome)
			}
		}
	}

	for (const failure of realFailures) {
		console.error('')
		console.error(`${failure.label}:`)

		if (isShellError(failure.error)) {
			logShellError(failure.error)
		} else if (failure.error instanceof Error) {
			console.error(`  ${failure.error.message}`)
		}
	}

	if (realFailures.length > 0) {
		const failureLabels = realFailures.map(f => f.label).join(', ')

		throw new Error(`task failed: ${failureLabels}`)
	}

	return outcomes
}
