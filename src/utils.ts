/**
 * Creates a function that wraps a string in an ANSI escape code.
 *
 * When the target stream is not a TTY (e.g. piped output), the wrapper
 * returns the input string unchanged so color codes don't leak into
 * non-terminal consumers.
 *
 * @param code - ANSI SGR parameter number (e.g. `1` for bold, `36` for cyan).
 * @param stream - The output stream to check for TTY support.
 * @returns A function that conditionally wraps its input in the escape sequence.
 */
function ansi(code: number, stream: NodeJS.WriteStream): (text: string) => string {
	const isTTY = stream.isTTY ?? false

	return (text: string) => (isTTY ? `\x1b[${code}m${text}\x1b[0m` : text)
}

const SGR_BOLD = 1
const SGR_DIM = 2
const SGR_GREEN = 32
const SGR_CYAN = 36

/**
 * A set of ANSI formatting helpers bound to `process.stderr`.
 *
 * Each function wraps a string in the corresponding escape sequence when
 * stderr is a TTY, and returns the string unchanged otherwise.
 */
export const fmt = {
	/** Bold text. */
	bold: ansi(SGR_BOLD, process.stderr),
	/** Dim (faint) text. */
	dim: ansi(SGR_DIM, process.stderr),
	/** Cyan text — used for flag names and values. */
	cyan: ansi(SGR_CYAN, process.stderr),
	/** Green text — used for section headers. */
	green: ansi(SGR_GREEN, process.stderr),
} as const
