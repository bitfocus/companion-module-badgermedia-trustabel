import { InstanceStatus } from '@companion-module/base'

/** The adapter answered, but with an HTTP error or a response the module couldn't use. */
export class TrustabelApiError extends Error {
	readonly statusCode: number
	readonly code: string | undefined
	/** The request and raw error, for the debug log. */
	readonly technical: string

	constructor(statusCode: number, code: string | undefined, request: string, detail?: string) {
		super(apiErrorMessage(statusCode, code, detail))
		this.name = 'TrustabelApiError'
		this.statusCode = statusCode
		this.code = code
		this.technical = `${request} → HTTP ${statusCode}${code ? ` ${code}` : ''}${detail ? `: ${detail}` : ''}`
	}
}

export type NetworkFailure = 'refused' | 'timeout' | 'unreachable' | 'dns' | 'interrupted' | 'other'

/** The request didn't get an answer from the adapter at all. */
export class TrustabelNetworkError extends Error {
	readonly failure: NetworkFailure
	readonly technical: string

	constructor(failure: NetworkFailure, request: string, cause: unknown) {
		const code = networkErrorCode(cause)
		super(NETWORK_MESSAGES[failure] + (failure === 'other' && code ? ` (${code})` : ''), { cause })
		this.name = 'TrustabelNetworkError'
		this.failure = failure
		this.technical = `${request} → ${describeCause(cause)}`
	}

	/**
	 * Whether trying again shortly could succeed. Refused and unreachable requests never reached the
	 * adapter, so even a non-repeatable one is safe to resend; an interrupted one may have been acted on.
	 * Timeouts already took their full time, and DNS or other failures won't fix themselves in a second.
	 */
	isWorthRetrying(repeatable: boolean): boolean {
		if (this.failure === 'refused' || this.failure === 'unreachable') return true
		return this.failure === 'interrupted' && repeatable
	}
}

/** Thrown when an action needs a panel but none is currently selected and reachable. */
export class NoPanelError extends Error {}

/** Thrown when an action is used while the connection has no adapter address configured. */
export class NotConfiguredError extends Error {}

const NETWORK_MESSAGES: Record<NetworkFailure, string> = {
	refused: 'The adapter refused the connection',
	timeout: 'The adapter did not respond within 5 seconds; check its IP address and the network or VPN connection',
	unreachable: "The adapter can't be reached; check its IP address and the network or VPN connection",
	dns: "The adapter's hostname could not be found",
	interrupted: 'The connection to the adapter was interrupted',
	other: 'Could not reach the adapter',
}

const NETWORK_CODES: Record<string, NetworkFailure> = {
	ECONNREFUSED: 'refused',
	ETIMEDOUT: 'timeout',
	UND_ERR_CONNECT_TIMEOUT: 'timeout',
	UND_ERR_HEADERS_TIMEOUT: 'timeout',
	UND_ERR_BODY_TIMEOUT: 'timeout',
	EHOSTUNREACH: 'unreachable',
	ENETUNREACH: 'unreachable',
	EHOSTDOWN: 'unreachable',
	ENETDOWN: 'unreachable',
	ENOTFOUND: 'dns',
	EAI_AGAIN: 'dns',
	ECONNRESET: 'interrupted',
	EPIPE: 'interrupted',
	UND_ERR_SOCKET: 'interrupted',
	UND_ERR_CLOSED: 'interrupted',
}

/**
 * Work out why `fetch` failed. Node's fetch reports every network problem as a bare "fetch failed"
 * TypeError with the real reason in `cause`, and a connection that drops while the response is being
 * read as "terminated".
 */
export function classifyNetworkError(err: unknown): NetworkFailure {
	for (let current: unknown = err; current instanceof Error; current = current.cause) {
		if (current.name === 'TimeoutError' || current.name === 'AbortError') return 'timeout'
		const code = errorCode(current)
		if (code && code in NETWORK_CODES) return NETWORK_CODES[code]
		if (current.message === 'terminated') return 'interrupted'
	}
	return 'other'
}

function errorCode(err: Error): string | undefined {
	return 'code' in err && typeof err.code === 'string' ? err.code : undefined
}

function networkErrorCode(err: unknown): string | undefined {
	for (let current: unknown = err; current instanceof Error; current = current.cause) {
		const code = errorCode(current)
		if (code) return code
	}
	return undefined
}

function describeCause(err: unknown): string {
	const parts: string[] = []
	for (let current: unknown = err; current instanceof Error; current = current.cause) {
		const code = errorCode(current)
		parts.push(code ? `${current.message} [${code}]` : current.message)
	}
	return parts.join(' ← ') || String(err)
}

function apiErrorMessage(status: number, code: string | undefined, detail: string | undefined): string {
	const message =
		API_CODE_MESSAGES[code ?? ''] ?? API_STATUS_MESSAGES[status] ?? `The adapter returned an error (HTTP ${status})`
	return detail ? `${message}: ${detail}` : message
}

const API_CODE_MESSAGES: Record<string, string> = {
	invalid_response: 'The adapter sent a response the module could not understand',
	not_available_in_protocol_mode: 'The adapter is in protocol mode; panel control is only available in server mode',
	panel_not_found: 'That panel is not connected to the adapter',
	invalid_label_id: 'That label does not exist on the panel',
	invalid_state: 'The panel refused the change in its current state',
}

const API_STATUS_MESSAGES: Record<number, string> = {
	400: 'The panel rejected the request as invalid',
	401: 'The adapter rejected the bearer token',
	403: 'The adapter rejected the bearer token',
	404: 'The adapter could not find what was requested',
	409: 'The panel refused the change in its current state',
	503: 'The panel did not respond',
}

/** A message for the user; `technicalDetail` has the request and raw error for the debug log. */
export function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err)
}

export function technicalDetail(err: unknown): string {
	if (err instanceof TrustabelApiError || err instanceof TrustabelNetworkError) return err.technical
	return errorMessage(err)
}

/**
 * Whether a failure says the adapter or panel can't be reached at all, as opposed to one request
 * being rejected (bad input, label not in dynamic mode, ...), which shouldn't change the status.
 */
export function isConnectionError(err: unknown): boolean {
	if (err instanceof NoPanelError || err instanceof NotConfiguredError) return false
	if (!(err instanceof TrustabelApiError)) return true
	return err.statusCode === 401 || err.statusCode === 403 || err.statusCode === 503
}

/** Map a request failure onto the instance status the user should see. */
export function statusForError(err: unknown): InstanceStatus {
	if (err instanceof TrustabelApiError) {
		if (err.statusCode === 401 || err.statusCode === 403) return InstanceStatus.AuthenticationFailure
		if (err.statusCode === 404 || err.statusCode === 409) return InstanceStatus.BadConfig
		if (err.statusCode === 503) return InstanceStatus.Disconnected
		return InstanceStatus.UnknownError
	}
	return InstanceStatus.ConnectionFailure
}
