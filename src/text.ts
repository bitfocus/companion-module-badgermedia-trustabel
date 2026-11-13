/** Letters and symbols that Unicode normalisation doesn't reduce to plain ASCII. */
const REPLACEMENTS: Record<string, string> = {
	ø: 'o',
	Ø: 'O',
	æ: 'ae',
	Æ: 'AE',
	œ: 'oe',
	Œ: 'OE',
	ß: 'ss',
	ẞ: 'SS',
	ð: 'd',
	Ð: 'D',
	đ: 'd',
	Đ: 'D',
	þ: 'th',
	Þ: 'TH',
	ł: 'l',
	Ł: 'L',
	ı: 'i',
	'‘': "'",
	'’': "'",
	'‚': "'",
	'“': '"',
	'”': '"',
	'„': '"',
	'–': '-',
	'—': '-',
	'−': '-',
	'…': '...',
	' ': ' ',
	'°': 'deg',
	'€': 'EUR',
	'£': 'GBP',
}

/**
 * Reduce text to printable ASCII, which is all the panel firmware renders: accents are stripped
 * (é → e), a few letters are spelled out (ø → o, æ → ae), and anything else, such as emoji, is dropped.
 */
export function toPanelText(text: string): string {
	return [...text.normalize('NFKD')]
		.map((char) => REPLACEMENTS[char] ?? char)
		.join('')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^\x20-\x7E]/g, '')
		.replace(/ {2,}/g, ' ')
		.trim()
}
