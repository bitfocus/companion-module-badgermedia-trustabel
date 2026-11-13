import { TrustabelApiError, TrustabelNetworkError, classifyNetworkError } from './errors.js'
import {
	isHealthResponse,
	isLabelResponse,
	isLabelsResponse,
	isPanelInfoResponse,
	isSystemInfoResponse,
	readApiError,
	type Guard,
} from './responses.js'
import type { ModuleConfig, PortNumber } from './types.js'

/** An empty string means no color is set. Black isn't accepted, as it isn't legible on the panel. */
export type LabelColor = 'white' | 'red' | 'green' | 'blue' | 'yellow' | 'cyan' | 'magenta' | 'grey' | 'orange' | ''

export const LABEL_STATUSES = ['ok', 'error', 'warning', 'idle', 'unknown'] as const
export type LabelStatus = (typeof LABEL_STATUSES)[number]

export type PortState = 'disconnected' | 'connected' | 'active' | 'fault' | 'config_error' | 'disabled'

export type AdapterMode = 'server' | 'protocol'

/**
 * A label's 0-based ID as the API uses it. Users see 1-based label numbers instead, so the brand makes
 * passing one where the other is expected a compile error; convert with `toLabelId`/`toLabelNumber`.
 */
export type LabelId = number & { readonly __labelId: true }

export function toLabelId(labelNumber: number): LabelId {
	return (labelNumber - 1) as LabelId
}

export function toLabelNumber(id: LabelId): number {
	return id + 1
}

/** Colors read back from the panel are plain strings, as the firmware doesn't restrict them. */
export interface LabelLine {
	t: string
	c: string
}

/** The API always carries exactly four lines per label. */
export type LabelLines = [LabelLine, LabelLine, LabelLine, LabelLine]

export interface Label {
	id: LabelId
	mode: 'text' | 'image'
	lines: LabelLines
	scale: number
	image: string
	dynamic: boolean
	dyn_text?: string
	status?: string
	/** The v2.0.3 spec calls this `dyn_colour`, but the panel firmware only uses `dyn_c`. */
	dyn_c?: string
}

/** `label/set` is a partial update: omitted fields keep their current value. */
export interface LabelPatch {
	id: LabelId
	mode?: 'text' | 'image'
	lines?: LabelLines
	scale?: number
	image?: string
	dynamic?: boolean
}

export interface DynamicLabelFields {
	dyn_text?: string
	status?: LabelStatus
	dyn_c?: LabelColor
}

export interface HealthPort {
	port: PortNumber
	state: PortState
}

export interface HealthResponse {
	model?: string
	firmware?: string
	build?: string
	uptime_s?: number
	ports: HealthPort[]
}

export interface PortInfo extends HealthPort {
	device_name?: string
	serial_number?: string
	firmware?: string
	build?: string
}

export interface SystemInfoResponse {
	adapter: {
		serial_number?: string
		hostname?: string
		mode: AdapterMode
		network?: {
			ip?: string
			link?: 'up' | 'down'
		}
	}
	ports: PortInfo[]
}

export interface PanelInfoResponse {
	device_name?: string
	serial_number?: string
	firmware_version?: string
	build?: string
	panel_mode?: 'single' | 'dual'
	orientation?: 'above' | 'below'
	screen_count?: number
}

/** A panel on an adapter port, with the details read once when it is selected. */
export interface PanelDetails {
	serial: string
	port: PortNumber
	info: PanelInfoResponse
	/** How many labels the panel has; this is not `screen_count`, as dual mode shows two per screen. */
	labelTotal: number
}

/** The serial number of the active panel on an adapter port, if there is one. */
export function findPanelOnPort(info: SystemInfoResponse, portNumber: PortNumber): string | null {
	const port = info.ports.find((candidate) => candidate.port === portNumber)
	return port?.state === 'active' && port.serial_number ? port.serial_number : null
}

const REQUEST_TIMEOUT_MS = 5000

/**
 * Waits before each retry. The adapter refuses all connections for windows of about 0.4–1 s now and
 * then, so these cover a window without holding a poll up for long.
 */
const RETRY_DELAYS_MS = [500, 1000]

type Method = 'GET' | 'POST'

interface RequestOptions {
	auth?: boolean
	body?: object
	/**
	 * Whether sending the request twice is harmless, so it can be retried after a connection drops
	 * mid-request. Defaults to true; requests that never reached the adapter are always retried.
	 */
	repeatable?: boolean
}

/** Maximum `count` accepted by `labels/get`. */
export const MAX_LABELS_PER_REQUEST = 24

/**
 * Client for the trustabel Network Adapter REST API v2.
 *
 * All endpoints except `/health` require the bearer token. Panel-scoped endpoints are addressed by
 * the panel's serial number and return 409 while the adapter is in protocol mode.
 */
export class TrustabelApi {
	readonly #baseUrl: string
	readonly #token: string

	constructor(config: ModuleConfig, token: string) {
		const port = config.port || 80
		const portSuffix = port === 80 ? '' : `:${port}`
		this.#baseUrl = `http://${config.host}${portSuffix}/api/v2`
		this.#token = token
	}

	async health(): Promise<HealthResponse> {
		return this.#read('GET', '/health', { auth: false }, isHealthResponse)
	}

	async info(): Promise<SystemInfoResponse> {
		return this.#read('GET', '/info', {}, isSystemInfoResponse)
	}

	async powerCycle(port: PortNumber): Promise<void> {
		await this.#request('POST', `/power-cycle/${port}`, { repeatable: false })
	}

	async reboot(): Promise<void> {
		await this.#request('POST', '/reboot', { repeatable: false })
	}

	/** Live query to the panel; the spec advises against polling this frequently. */
	async panelInfo(serial: string): Promise<PanelInfoResponse> {
		return this.#read('GET', `${panelPath(serial)}/info`, {}, isPanelInfoResponse)
	}

	async flashLabels(serial: string, labelIds: LabelId[], durationSeconds: number): Promise<void> {
		await this.#request('POST', `${panelPath(serial)}/label/flash`, {
			body: { label_ids: labelIds, duration_seconds: durationSeconds },
		})
	}

	async spotlightLabels(serial: string, labelIds: LabelId[], durationSeconds: number): Promise<void> {
		await this.#request('POST', `${panelPath(serial)}/label/spotlight`, {
			body: { label_ids: labelIds, duration_seconds: durationSeconds },
		})
	}

	async labelGet(serial: string, id: LabelId): Promise<Label> {
		const response = await this.#read('GET', `${panelPath(serial)}/label/get/${id}`, {}, isLabelResponse)
		return response.label
	}

	async labelsGet(serial: string, start: number, count: number): Promise<Label[]> {
		const response = await this.#read(
			'POST',
			`${panelPath(serial)}/labels/get`,
			{ body: { start, count } },
			isLabelsResponse,
		)
		return response.labels
	}

	/** Every label from 0 to `total - 1`, read in as few requests as possible. */
	async labelsGetAll(serial: string, total: number): Promise<Label[]> {
		const labels: Label[] = []
		for (let start = 0; start < total; start += MAX_LABELS_PER_REQUEST) {
			labels.push(...(await this.labelsGet(serial, start, Math.min(MAX_LABELS_PER_REQUEST, total - start))))
		}
		return labels
	}

	/** Read what the module needs to know about a newly found panel, along with its labels. */
	async describePanel(serial: string, port: PortNumber): Promise<{ details: PanelDetails; labels: Label[] }> {
		const info = await this.panelInfo(serial)
		// The API has no label count, but a full-size read returns every label the panel has.
		const labels = await this.labelsGet(serial, 0, MAX_LABELS_PER_REQUEST)
		return { details: { serial, port, info, labelTotal: labels.length }, labels }
	}

	async labelSet(serial: string, label: LabelPatch, perm: boolean): Promise<void> {
		await this.#request('POST', `${panelPath(serial)}/label/set`, { body: { label, perm } })
	}

	async labelDynamic(serial: string, id: LabelId, fields: DynamicLabelFields): Promise<void> {
		await this.#request('POST', `${panelPath(serial)}/label/dynamic`, { body: { id, ...fields } })
	}

	/** Send a request and check that the response has the shape `guard` describes. */
	async #read<T>(method: Method, path: string, options: RequestOptions, guard: Guard<T>): Promise<T> {
		const { status, body } = await this.#request(method, path, options)
		if (!guard(body)) {
			throw new TrustabelApiError(status, 'invalid_response', `${method} ${path}`)
		}
		return body
	}

	async #request(method: Method, path: string, options: RequestOptions): Promise<{ status: number; body: unknown }> {
		for (let attempt = 0; ; attempt++) {
			try {
				return await this.#send(method, path, options)
			} catch (err) {
				const delay = RETRY_DELAYS_MS[attempt]
				const retryable = err instanceof TrustabelNetworkError && err.isWorthRetrying(options.repeatable !== false)
				if (!retryable || delay === undefined) throw err
				await new Promise((resolve) => setTimeout(resolve, delay))
			}
		}
	}

	async #send(method: Method, path: string, options: RequestOptions): Promise<{ status: number; body: unknown }> {
		const request = `${method} ${path}`
		const headers: Record<string, string> = { Accept: 'application/json' }
		if (options.auth !== false) headers['Authorization'] = `Bearer ${this.#token}`

		let requestBody: string | undefined
		if (options.body !== undefined) {
			headers['Content-Type'] = 'application/json'
			requestBody = JSON.stringify(options.body)
		}

		let status: number
		let ok: boolean
		let text: string
		try {
			const response = await fetch(`${this.#baseUrl}${path}`, {
				method,
				headers,
				body: requestBody,
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			})
			status = response.status
			ok = response.ok
			// Reading the body can fail on its own ("terminated") if the connection drops part way.
			text = await response.text()
		} catch (err) {
			throw new TrustabelNetworkError(classifyNetworkError(err), request, err)
		}

		let body: unknown
		try {
			body = text.length > 0 ? JSON.parse(text) : {}
		} catch {
			body = {}
		}

		if (!ok) {
			const error = readApiError(body)
			const detail = [error.detail, error.upstreamError && `panel error ${error.upstreamError}`]
				.filter(Boolean)
				.join(', ')
			throw new TrustabelApiError(status, error.code, request, detail || undefined)
		}

		return { status, body }
	}
}

function panelPath(serial: string): string {
	return `/panel/${encodeURIComponent(serial)}`
}
