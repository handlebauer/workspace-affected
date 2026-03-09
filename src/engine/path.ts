import { sep } from 'node:path'

/**
 * Converts OS-specific path separators to forward slashes.
 *
 * @param input - Raw file path potentially containing backslashes on Windows.
 * @returns The same path with all separators normalized to `/`.
 */
export function normalizePath(input: string): string {
	return input.split(sep).join('/')
}
