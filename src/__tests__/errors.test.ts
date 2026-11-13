import { describe, expect, it } from 'vitest'
import {
	NoPanelError,
	NotConfiguredError,
	TrustabelApiError,
	TrustabelNetworkError,
	classifyNetworkError,
	isConnectionError,
	technicalDetail,
	type NetworkFailure,
} from '../errors.js'

/** What Node's fetch throws: a bare "fetch failed" with the real reason in `cause`. */
function fetchFailure(code: string, message = code): TypeError {
	return new TypeError('fetch failed', { cause: Object.assign(new Error(message), { code }) })
}

describe('classifyNetworkError', () => {
	it.each<[string, unknown, NetworkFailure]>([
		['refused', fetchFailure('ECONNREFUSED'), 'refused'],
		['host unreachable', fetchFailure('EHOSTUNREACH'), 'unreachable'],
		['network unreachable', fetchFailure('ENETUNREACH'), 'unreachable'],
		['DNS', fetchFailure('ENOTFOUND'), 'dns'],
		['reset', fetchFailure('ECONNRESET'), 'interrupted'],
		['socket closed', fetchFailure('UND_ERR_SOCKET', 'other side closed'), 'interrupted'],
		['body cut off', new TypeError('terminated', { cause: fetchFailure('UND_ERR_SOCKET') }), 'interrupted'],
		['bare terminated', new TypeError('terminated'), 'interrupted'],
		['timeout', new DOMException('The operation was aborted due to timeout', 'TimeoutError'), 'timeout'],
		['connect timeout', fetchFailure('UND_ERR_CONNECT_TIMEOUT'), 'timeout'],
		['unknown', new TypeError('fetch failed', { cause: new Error('bad port') }), 'other'],
	])('%s', (_name, err, expected) => {
		expect(classifyNetworkError(err)).toBe(expected)
	})
})

describe('TrustabelNetworkError', () => {
	it('gives a readable message and keeps the raw cause for the debug log', () => {
		const err = new TrustabelNetworkError(
			'refused',
			'GET /health',
			fetchFailure('ECONNREFUSED', 'connect ECONNREFUSED'),
		)
		expect(err.message).toBe('The adapter refused the connection')
		expect(technicalDetail(err)).toBe('GET /health → fetch failed ← connect ECONNREFUSED [ECONNREFUSED]')
	})

	it.each<[NetworkFailure, boolean, boolean]>([
		['refused', true, true],
		['refused', false, true],
		['unreachable', false, true],
		['interrupted', true, true],
		['interrupted', false, false],
		['timeout', true, false],
		['dns', true, false],
		['other', true, false],
	])('%s with repeatable=%s is worth retrying: %s', (failure, repeatable, expected) => {
		expect(new TrustabelNetworkError(failure, 'GET /', undefined).isWorthRetrying(repeatable)).toBe(expected)
	})
})

describe('TrustabelApiError', () => {
	it('uses the error code for the message and keeps the request in the technical detail', () => {
		const err = new TrustabelApiError(400, 'invalid_label_id', 'GET /panel/SN/label/get/99', 'out of range')
		expect(err.message).toBe('That label does not exist on the panel: out of range')
		expect(err.technical).toBe('GET /panel/SN/label/get/99 → HTTP 400 invalid_label_id: out of range')
	})

	it('falls back to the HTTP status, then a generic message', () => {
		expect(new TrustabelApiError(401, undefined, 'GET /info').message).toBe('The adapter rejected the bearer token')
		expect(new TrustabelApiError(418, undefined, 'GET /info').message).toBe('The adapter returned an error (HTTP 418)')
	})
})

describe('isConnectionError', () => {
	it('treats local problems and rejected requests as not affecting the connection', () => {
		expect(isConnectionError(new NoPanelError('x'))).toBe(false)
		expect(isConnectionError(new NotConfiguredError('x'))).toBe(false)
		expect(isConnectionError(new TrustabelApiError(409, 'invalid_state', 'POST /x'))).toBe(false)
	})

	it('treats network failures, a rejected token and an unavailable panel as connection problems', () => {
		expect(isConnectionError(new TrustabelNetworkError('refused', 'GET /', undefined))).toBe(true)
		expect(isConnectionError(new TrustabelApiError(401, undefined, 'GET /info'))).toBe(true)
		expect(isConnectionError(new TrustabelApiError(503, undefined, 'GET /x'))).toBe(true)
	})
})
