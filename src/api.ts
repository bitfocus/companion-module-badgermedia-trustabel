import { InstanceStatus } from '@companion-module/base'
import type { ModuleConfig } from './config.js'

export interface LabelLine {
	t: string
	c: string
}

export interface LabelObject {
	id: number
	mode: 'text' | 'image'
	lines: LabelLine[]
	image: string
	scale: number
	dynamic?: boolean
	dyn_text?: string | null
	dyn_c?: string | null
	status?: string | null
}

export interface LabelsGetResponse {
	labels: LabelObject[]
	start: number
	count: number
}

export interface ApiErrorBody {
	ok?: boolean
	error?: {
		code?: string
		detail?: string | null
	}
}

/** An HTTP-level failure from the panel, carrying the API error code where one was returned. */
export class TrustabelApiError extends Error {
	readonly statusCode: number
	readonly code: string | undefined

	constructor(statusCode: number, code: string | undefined, message: string) {
		super(message)
		this.name = 'TrustabelApiError'
		this.statusCode = statusCode
		this.code = code
	}
}

type QueryValue = string | number | boolean

const REQUEST_TIMEOUT_MS = 5000

/**
 * Client for the trustabel Network Adapter REST API v1.4.
 *
 * All endpoints except `/health` require the bearer token.
 */
export class TrustabelApi {
	readonly #baseUrl: string
	readonly #token: string

	constructor(config: ModuleConfig) {
		const port = Number(config.port) || 80
		const portSuffix = port === 80 ? '' : `:${port}`
		this.#baseUrl = `http://${config.host}${portSuffix}`
		this.#token = config.token ?? ''
	}

	async health(): Promise<Record<string, unknown>> {
		return this.#request('GET', '/api/v1/health', { auth: false })
	}

	async info(): Promise<Record<string, unknown>> {
		return this.#request('GET', '/api/v1/info', {})
	}

	async backlight(): Promise<void> {
		await this.#request('POST', '/api/v1/backlight', {})
	}

	async screensDisplay(pairs: string): Promise<void> {
		await this.#request('POST', '/api/v1/screens/display', { query: { pairs } })
	}

	async flashScreen(sid: string, duration: number): Promise<void> {
		await this.#request('POST', '/api/v1/flash/screen', { query: { sid, duration } })
	}

	async spotlightScreen(sid: string, duration: number): Promise<void> {
		await this.#request('POST', '/api/v1/spotlight/screen', { query: { sid, duration } })
	}

	async flashLabel(lid: string, duration: number): Promise<void> {
		await this.#request('POST', '/api/v1/flash/label', { query: { lid, duration } })
	}

	async spotlightLabel(lid: string, duration: number): Promise<void> {
		await this.#request('POST', '/api/v1/spotlight/label', { query: { lid, duration } })
	}

	async labelGet(id: number): Promise<LabelObject> {
		return this.#request('GET', '/api/v1/label_get', { query: { id } })
	}

	async labelsGet(start: number, count: number): Promise<LabelsGetResponse> {
		return this.#request('GET', '/api/v1/labels_get', { query: { start, count } })
	}

	async labelSet(label: LabelObject, perm: boolean): Promise<void> {
		await this.#request('POST', '/api/v1/label_set', { body: { label, perm } })
	}

	async labelDynamic(id: number, fields: { dyn_text?: string; dyn_c?: string; status?: string }): Promise<void> {
		await this.#request('POST', '/api/v1/label_dynamic', { body: { id, ...fields } })
	}

	async panelSet(panelMode: 'single' | 'dual', orientation: 'above' | 'below'): Promise<void> {
		await this.#request('POST', '/api/v1/panel/set', {
			body: { panel_mode: panelMode, orientation },
		})
	}

	async #request(
		method: 'GET' | 'POST',
		path: string,
		options: {
			auth?: boolean
			query?: Record<string, QueryValue>
			body?: unknown
		},
	): Promise<any> {
		const url = new URL(path, this.#baseUrl)
		for (const [key, value] of Object.entries(options.query ?? {})) {
			url.searchParams.set(key, String(value))
		}

		const headers: Record<string, string> = { Accept: 'application/json' }
		if (options.auth !== false) headers['Authorization'] = `Bearer ${this.#token}`

		let body: string | undefined
		if (options.body !== undefined) {
			headers['Content-Type'] = 'application/json'
			body = JSON.stringify(options.body)
		}

		const response = await fetch(url, {
			method,
			headers,
			body,
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		})

		const text = await response.text()
		let parsed: unknown
		try {
			parsed = text.length > 0 ? JSON.parse(text) : {}
		} catch {
			parsed = {}
		}

		if (!response.ok) {
			const error = (parsed as ApiErrorBody)?.error
			const detail = error?.detail ? `: ${error.detail}` : ''
			throw new TrustabelApiError(
				response.status,
				error?.code,
				`${method} ${path} failed (HTTP ${response.status}${error?.code ? ` ${error.code}` : ''})${detail}`,
			)
		}

		return parsed
	}
}

/** Map a request failure onto the instance status the user should see. */
export function statusForError(err: unknown): InstanceStatus {
	if (err instanceof TrustabelApiError) {
		if (err.statusCode === 401 || err.statusCode === 403) return InstanceStatus.AuthenticationFailure
		return InstanceStatus.UnknownError
	}
	return InstanceStatus.ConnectionFailure
}
