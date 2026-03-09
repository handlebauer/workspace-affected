import { describe, expect, test } from 'bun:test'

import { fmt } from './utils'

describe('fmt', () => {
	test('returns plain text when stderr is not a TTY', () => {
		expect(fmt.bold('hello')).toBe('hello')
		expect(fmt.dim('hello')).toBe('hello')
		expect(fmt.cyan('hello')).toBe('hello')
		expect(fmt.green('hello')).toBe('hello')
	})

	test('does not alter empty strings', () => {
		expect(fmt.bold('')).toBe('')
		expect(fmt.dim('')).toBe('')
	})
})
