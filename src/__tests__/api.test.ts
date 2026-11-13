import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TrustabelApi } from '../api.js'
import { TrustabelNetworkError } from '../errors.js'

const HEALTH = { ports: [{ port: 1, state: 'active' }] }

function refused(): TypeError {
	return new TypeError('fetch failed', {
		cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
	})
}

function interrupted(): TypeError {
	return new TypeError('terminated')
}

function ok(body: unknown): Response {
	return new Response(JSON.stringify(body), { status: 200 })
}

describe('TrustabelApi retries', () => {
	const fetchMock = vi.fn<typeof fetch>()
	const api = new TrustabelApi({ host: 'adapter', port: 80 }, 'token')

	beforeEach(() => {
		vi.useFakeTimers()
		fetchMock.mockReset()
		vi.stubGlobal('fetch', fetchMock)
	})

	afterEach(() => {
		vi.useRealTimers()
		vi.unstubAllGlobals()
	})

	it('retries refused connections and succeeds once the adapter accepts', async () => {
		fetchMock.mockRejectedValueOnce(refused()).mockRejectedValueOnce(refused()).mockResolvedValueOnce(ok(HEALTH))
		const result = api.health()
		await vi.runAllTimersAsync()
		await expect(result).resolves.toEqual(HEALTH)
		expect(fetchMock).toHaveBeenCalledTimes(3)
	})

	it('gives up after two retries with a readable error', async () => {
		fetchMock.mockRejectedValue(refused())
		const result = api.health()
		const assertion = expect(result).rejects.toThrow('The adapter refused the connection')
		await vi.runAllTimersAsync()
		await assertion
		expect(fetchMock).toHaveBeenCalledTimes(3)
	})

	it('retries an interrupted read, which is safe to repeat', async () => {
		fetchMock.mockRejectedValueOnce(interrupted()).mockResolvedValueOnce(ok(HEALTH))
		const result = api.health()
		await vi.runAllTimersAsync()
		await expect(result).resolves.toEqual(HEALTH)
		expect(fetchMock).toHaveBeenCalledTimes(2)
	})

	it('does not resend a reboot that may already have reached the adapter', async () => {
		fetchMock.mockRejectedValue(interrupted())
		const result = api.reboot()
		const assertion = expect(result).rejects.toBeInstanceOf(TrustabelNetworkError)
		await vi.runAllTimersAsync()
		await assertion
		expect(fetchMock).toHaveBeenCalledTimes(1)
	})

	it('does resend a reboot that was refused, since it never reached the adapter', async () => {
		fetchMock.mockRejectedValueOnce(refused()).mockResolvedValueOnce(ok({ ok: true }))
		const result = api.reboot()
		await vi.runAllTimersAsync()
		await expect(result).resolves.toBeUndefined()
		expect(fetchMock).toHaveBeenCalledTimes(2)
	})

	it('does not retry an HTTP error', async () => {
		fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { code: 'unauthorized' } }), { status: 401 }))
		await expect(api.info()).rejects.toThrow('The adapter rejected the bearer token')
		expect(fetchMock).toHaveBeenCalledTimes(1)
	})

	it('rejects a response that does not have the expected shape', async () => {
		fetchMock.mockResolvedValue(ok({ ports: 'none' }))
		await expect(api.health()).rejects.toThrow('The adapter sent a response the module could not understand')
	})
})
