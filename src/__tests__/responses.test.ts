import { describe, expect, it } from 'vitest'
import { isHealthResponse, isLabel, isSystemInfoResponse, readApiError } from '../responses.js'

// Recorded from a T-NA4-4 (firmware 02.01.001) with a panel on 01.05.002.
const label = {
	id: 2,
	dyn_text: '',
	image: '',
	status: 'ok',
	scale: 3,
	dynamic: false,
	dyn_c: '',
	lines: [
		{ c: 'white', t: 'LABEL 03' },
		{ c: 'white', t: 'SUB 03' },
		{ c: 'white', t: '' },
		{ c: 'white', t: '' },
	],
	mode: 'text',
}

const health = {
	model: 'T-NA4-4',
	ok: true,
	uptime_s: 577,
	build: '0007',
	firmware: '02.01.001',
	ports: [
		{ port: 1, state: 'active' },
		{ port: 2, state: 'disconnected' },
		{ port: 3, state: 'disconnected' },
		{ port: 4, state: 'disconnected' },
	],
}

describe('isLabel', () => {
	it('accepts a label as the panel returns it', () => {
		expect(isLabel(label)).toBe(true)
	})

	it('rejects a label without exactly four lines', () => {
		expect(isLabel({ ...label, lines: label.lines.slice(0, 3) })).toBe(false)
	})

	it('rejects an unknown mode or a missing field', () => {
		expect(isLabel({ ...label, mode: 'video' })).toBe(false)
		const { dynamic: _dynamic, ...withoutDynamic } = label
		expect(isLabel(withoutDynamic)).toBe(false)
	})

	it('accepts colors and statuses outside the documented lists, as the firmware does', () => {
		expect(isLabel({ ...label, status: 'warn', dyn_c: 'black' })).toBe(true)
	})
})

describe('isHealthResponse', () => {
	it('accepts the adapter health response', () => {
		expect(isHealthResponse(health)).toBe(true)
	})

	it('rejects an unknown port state or port number', () => {
		expect(isHealthResponse({ ...health, ports: [{ port: 1, state: 'sleeping' }] })).toBe(false)
		expect(isHealthResponse({ ...health, ports: [{ port: 5, state: 'active' }] })).toBe(false)
	})
})

describe('isSystemInfoResponse', () => {
	it('requires a known adapter mode', () => {
		const info = { adapter: { mode: 'server', network: { ip: '172.27.27.212', link: 'up' } }, ports: health.ports }
		expect(isSystemInfoResponse(info)).toBe(true)
		expect(isSystemInfoResponse({ ...info, adapter: { mode: 'bridge' } })).toBe(false)
	})
})

describe('readApiError', () => {
	it('reads the error details the adapter may send', () => {
		expect(readApiError({ ok: false, error: { code: 'invalid_state', detail: 'x', upstream_err: '0x12' } })).toEqual({
			code: 'invalid_state',
			detail: 'x',
			upstreamError: '0x12',
		})
	})

	it('ignores anything that is not an error body', () => {
		expect(readApiError('nope')).toEqual({})
		expect(readApiError({ error: { code: 5 } })).toEqual({
			code: undefined,
			detail: undefined,
			upstreamError: undefined,
		})
	})
})
