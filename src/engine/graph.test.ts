import { describe, expect, test } from 'bun:test'

import { buildReverseGraph, expandChangedPackageNames } from './graph'

describe('buildReverseGraph', () => {
	test('builds reverse graph from dependency map', () => {
		const reverse = buildReverseGraph(
			new Map<string, string[]>([
				['@acme/a', []],
				['@acme/b', ['@acme/a']],
				['@acme/c', ['@acme/b']],
			]),
		)

		expect(reverse.get('@acme/a')).toEqual(['@acme/b'])
		expect(reverse.get('@acme/b')).toEqual(['@acme/c'])
		expect(reverse.get('@acme/c')).toEqual([])
	})
})

describe('expandChangedPackageNames', () => {
	test('returns changed package and transitively dependent packages', () => {
		const reverse = new Map<string, string[]>([
			['@acme/webhooks', ['@acme/core']],
			['@acme/core', ['@acme/sdk', '@acme/studio']],
			['@acme/sdk', []],
			['@acme/studio', ['@acme/cli']],
			['@acme/cli', []],
		])

		expect(expandChangedPackageNames(['@acme/webhooks'], reverse)).toEqual([
			'@acme/webhooks',
			'@acme/core',
			'@acme/sdk',
			'@acme/studio',
			'@acme/cli',
		])
	})

	test('dedupes expanded names for overlapping roots', () => {
		const reverse = new Map<string, string[]>([
			['@acme/a', ['@acme/c']],
			['@acme/b', ['@acme/c']],
			['@acme/c', ['@acme/d']],
			['@acme/d', []],
		])

		expect(expandChangedPackageNames(['@acme/a', '@acme/b'], reverse)).toEqual([
			'@acme/a',
			'@acme/b',
			'@acme/c',
			'@acme/d',
		])
	})

	test('ignores unknown changed package names', () => {
		const reverse = new Map<string, string[]>([['@acme/a', []]])

		expect(expandChangedPackageNames(['@acme/missing'], reverse)).toEqual([])
	})
})
