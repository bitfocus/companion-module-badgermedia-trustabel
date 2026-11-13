import { describe, expect, it } from 'vitest'
import { parseLabelNumbers } from '../actions.js'
import { toLabelId, toLabelNumber } from '../api.js'

describe('parseLabelNumbers', () => {
	it('expands ALL to every label number from 1', () => {
		expect(parseLabelNumbers('ALL', 3)).toEqual({ numbers: [1, 2, 3], rejected: [] })
		expect(parseLabelNumbers('all', 2)).toEqual({ numbers: [1, 2], rejected: [] })
	})

	it('sorts, de-duplicates and trims a list', () => {
		expect(parseLabelNumbers(' 5, 1,5 ,2', 24)).toEqual({ numbers: [1, 2, 5], rejected: [] })
	})

	it('combines ALL with explicit numbers', () => {
		expect(parseLabelNumbers('ALL, 30', 2)).toEqual({ numbers: [1, 2, 30], rejected: [] })
	})

	it('rejects 0, negatives and non-numbers, since labels are numbered from 1', () => {
		expect(parseLabelNumbers('0, -1, x, 1.5, 2', 24)).toEqual({ numbers: [2], rejected: ['0', '-1', 'x', '1.5'] })
	})

	it('returns nothing for an empty list or ALL on a panel with no labels', () => {
		expect(parseLabelNumbers('', 24)).toEqual({ numbers: [], rejected: [] })
		expect(parseLabelNumbers('ALL', 0)).toEqual({ numbers: [], rejected: [] })
	})
})

describe('label numbers and IDs', () => {
	it('maps label number 1 to API ID 0 and back', () => {
		expect(toLabelId(1)).toBe(0)
		expect(toLabelId(24)).toBe(23)
		expect(toLabelNumber(toLabelId(7))).toBe(7)
	})
})
