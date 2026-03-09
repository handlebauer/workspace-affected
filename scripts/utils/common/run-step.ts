import { bold } from 'colorette'

import { formatStepSuccessText } from './format.ts'
import { isInteractive, Spinner } from './spinner.ts'

import type { RunStepOptions } from './types.ts'

const EXIT_INDENT = '  '
const INDENT_SPACES = 4

type ShellError = Error &
	Readonly<{
		exitCode: number
		stderr: Buffer
		stdout: Buffer
	}>

type RunTask<T> = () => T | Promise<T>

/**
 * Check whether an error carries shell output (stderr/stdout).
 *
 * Bun shell commands that fail throw a `ShellError` with Buffer
 * properties. This guard narrows the type without importing internals.
 *
 * @param error - Error to inspect
 * @returns True if the error has exitCode, stderr, and stdout properties
 */
function isShellError(error: unknown): error is ShellError {
	return error instanceof Error && 'exitCode' in error && 'stderr' in error && 'stdout' in error
}

/**
 * Indent every line of a multi-line string.
 *
 * @param text - Text to indent
 * @param indent - Indent prefix string
 * @returns Indented text
 */
function indentLines(text: string, indent: string): string {
	return text
		.split('\n')
		.map(line => `${indent}${line}`)
		.join('\n')
}

/**
 * Log the stderr/stdout from a failed shell command.
 *
 * @param error - Shell error with exit code and output buffers
 */
function logShellError(error: ShellError): void {
	console.error(`${EXIT_INDENT}Exit Code: ${String(error.exitCode)}`)

	const stdout = error.stdout.toString().trim()
	const stderr = error.stderr.toString().trim()

	if (stdout) {
		console.error(`${EXIT_INDENT}Stdout:`)
		console.error(indentLines(stdout, ' '.repeat(INDENT_SPACES)))
	}

	if (stderr) {
		console.error(`${EXIT_INDENT}Stderr:`)
		console.error(indentLines(stderr, ' '.repeat(INDENT_SPACES)))
	}
}

/**
 * Log additional error details after a step failure.
 *
 * In TTY mode the spinner already rendered the failure line, so only
 * extra details (exit code, stdout, stderr) are printed. In non-TTY
 * mode the header is printed since the spinner was silent.
 *
 * @param label - Step label (used in non-TTY header)
 * @param error - Caught error
 */
function logStepFailure(label: string, error: unknown): void {
	if (!isInteractive()) {
		console.error(`✖ Failed: ${label}`)
	}

	if (isShellError(error)) {
		console.error('')
		logShellError(error)
	}
}

/**
 * Run a task with spinner/timing and structured error output.
 *
 * Supports:
 * - `runStep('Done!')`
 * - `runStep('Running checks', fn, 'Checks passed')`
 * - `runStep('Publishing', fn, result => \`Published \${result.version}\`)`
 *
 * The `replace` option clears the spinner line on success instead of printing
 * a final success line.
 *
 * @param text - Spinner label text shown while running
 * @returns Resolves when the step completes
 */
export async function runStep(text: string): Promise<void>
// eslint-disable-next-line max-params
export async function runStep<T>(
	text: string,
	action: RunTask<T>,
	successText?: string | ((result: T) => string),
	options?: RunStepOptions,
): Promise<T>
// eslint-disable-next-line max-params
export async function runStep<T>(
	text: string,
	action?: RunTask<T>,
	successText?: string | ((result: T) => string),
	options?: RunStepOptions,
): Promise<T | void> {
	const spinner = new Spinner(text)

	if (!action) {
		spinner.start()
		spinner.update('success', bold(text))
		spinner.stop()

		return
	}

	spinner.start()

	const startTimeMs = Date.now()

	try {
		const result = await action()

		if (options?.replace) {
			spinner.clear()
		} else {
			const finalText =
				typeof successText === 'function' ? successText(result) : (successText ?? text)

			spinner.update('success', formatStepSuccessText(finalText, Date.now() - startTimeMs))
			spinner.stop()
		}

		return result
	} catch (error: unknown) {
		spinner.update('error')
		spinner.stop()

		logStepFailure(text, error)

		throw error
	}
}
