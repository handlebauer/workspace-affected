import { bold, dim } from 'colorette'

const MILLIS_PER_SECOND = 1000
const ROUND_MILLISECONDS = 0
const DURATION_DECIMALS = 2

/**
 * Format a millisecond duration as a human-readable label.
 *
 * @param durationMs - Duration in milliseconds
 * @returns Formatted string (e.g. "184ms" or "1.23s")
 */
function formatDurationLabel(durationMs: number): string {
	if (durationMs < MILLIS_PER_SECOND) {
		return `${Math.round(durationMs).toFixed(ROUND_MILLISECONDS)}ms`
	}

	return `${(durationMs / MILLIS_PER_SECOND).toFixed(DURATION_DECIMALS)}s`
}

/**
 * Format a step success message with bold label and dimmed duration.
 *
 * @param label - Step label text
 * @param durationMs - Duration in milliseconds
 * @returns Formatted success string
 */
export function formatStepSuccessText(label: string, durationMs: number): string {
	return `${bold(label)} ${dim(`[${formatDurationLabel(durationMs)}]`)}`
}

/**
 * Format a task result line for display.
 *
 * @param input - Task result details
 * @param input.cancelled - Whether the task was cancelled
 * @param input.durationMs - Duration in milliseconds
 * @param input.includeFailurePrefix - Whether to prefix with "Failed:"
 * @param input.label - Task label text
 * @param input.ok - Whether the task succeeded
 * @returns Formatted result string
 */
export function formatTaskResultText(input: {
	cancelled?: boolean
	durationMs: number
	includeFailurePrefix?: boolean
	label: string
	ok: boolean
}): string {
	const formattedLabel = formatStepSuccessText(input.label, input.durationMs)

	if (input.cancelled === true) {
		return `Cancelled: ${dim(input.label)} ${dim(`[${formatDurationLabel(input.durationMs)}]`)}`
	}

	if (input.includeFailurePrefix === true && !input.ok) {
		return `Failed: ${formattedLabel}`
	}

	return formattedLabel
}
