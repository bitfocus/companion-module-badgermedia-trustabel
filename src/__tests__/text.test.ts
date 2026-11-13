import { describe, expect, it } from 'vitest'
import { toPanelText } from '../text.js'

describe('toPanelText', () => {
	it.each([
		['thank you Jørgen', 'thank you Jorgen'],
		['Señor Café', 'Senor Cafe'],
		['Ærø Straße', 'AEro Strasse'],
		['Łódź Øresund', 'Lodz Oresund'],
		['GO 🚀 LIVE ✅', 'GO LIVE'],
		['“Quoted” – 5…', '"Quoted" - 5...'],
		['  plain ASCII stays  ', 'plain ASCII stays'],
		['🚀', ''],
	])('%j → %j', (input, expected) => {
		expect(toPanelText(input)).toBe(expected)
	})

	it('only ever returns printable ASCII', () => {
		expect(toPanelText('日本語 ½ ™  x')).toMatch(/^[\x20-\x7E]*$/)
	})
})
