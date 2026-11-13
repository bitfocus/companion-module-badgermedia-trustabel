import type {
	AdapterMode,
	HealthPort,
	HealthResponse,
	Label,
	LabelLine,
	PanelInfoResponse,
	PortInfo,
	PortState,
	SystemInfoResponse,
} from './api.js'
import type { PortNumber } from './types.js'

/**
 * Runtime checks for what the adapter returns, so the rest of the module can rely on the types without
 * casting. Fields that the module only displays are optional; fields it makes decisions on are checked
 * against their allowed values.
 */

export type Guard<T> = (value: unknown) => value is T

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
	return typeof value === 'string'
}

function isNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value)
}

function isBoolean(value: unknown): value is boolean {
	return typeof value === 'boolean'
}

function oneOf<T extends string | number>(...values: T[]): Guard<T> {
	return (value): value is T => values.some((allowed) => allowed === value)
}

function optional<T>(guard: Guard<T>): Guard<T | undefined> {
	return (value): value is T | undefined => value === undefined || guard(value)
}

function arrayOf<T>(guard: Guard<T>): Guard<T[]> {
	return (value): value is T[] => Array.isArray(value) && value.every(guard)
}

const optionalString = optional(isString)
const isPortNumber: Guard<PortNumber> = oneOf(1, 2, 3, 4)
const isPortState: Guard<PortState> = oneOf('disconnected', 'connected', 'active', 'fault', 'config_error', 'disabled')
const isAdapterMode: Guard<AdapterMode> = oneOf('server', 'protocol')

function isHealthPort(value: unknown): value is HealthPort {
	return isRecord(value) && isPortNumber(value.port) && isPortState(value.state)
}

function isPortInfo(value: unknown): value is PortInfo {
	return (
		isRecord(value) &&
		optionalString(value.device_name) &&
		optionalString(value.serial_number) &&
		optionalString(value.firmware) &&
		optionalString(value.build) &&
		isHealthPort(value)
	)
}

export function isHealthResponse(value: unknown): value is HealthResponse {
	return (
		isRecord(value) &&
		optionalString(value.model) &&
		optionalString(value.firmware) &&
		optionalString(value.build) &&
		optional(isNumber)(value.uptime_s) &&
		arrayOf(isHealthPort)(value.ports)
	)
}

export function isSystemInfoResponse(value: unknown): value is SystemInfoResponse {
	if (!isRecord(value) || !isRecord(value.adapter) || !arrayOf(isPortInfo)(value.ports)) return false
	const { adapter } = value
	const network = adapter.network
	return (
		isAdapterMode(adapter.mode) &&
		optionalString(adapter.serial_number) &&
		optionalString(adapter.hostname) &&
		(network === undefined ||
			(isRecord(network) && optionalString(network.ip) && optional(oneOf('up', 'down'))(network.link)))
	)
}

export function isPanelInfoResponse(value: unknown): value is PanelInfoResponse {
	return (
		isRecord(value) &&
		optionalString(value.device_name) &&
		optionalString(value.serial_number) &&
		optionalString(value.firmware_version) &&
		optionalString(value.build) &&
		optional(oneOf('single', 'dual'))(value.panel_mode) &&
		optional(oneOf('above', 'below'))(value.orientation) &&
		optional(isNumber)(value.screen_count)
	)
}

function isLabelLine(value: unknown): value is LabelLine {
	return isRecord(value) && isString(value.t) && isString(value.c)
}

export function isLabel(value: unknown): value is Label {
	return (
		isRecord(value) &&
		isNumber(value.id) &&
		oneOf('text', 'image')(value.mode) &&
		Array.isArray(value.lines) &&
		value.lines.length === 4 &&
		value.lines.every(isLabelLine) &&
		isNumber(value.scale) &&
		isString(value.image) &&
		isBoolean(value.dynamic) &&
		optionalString(value.dyn_text) &&
		optionalString(value.status) &&
		optionalString(value.dyn_c)
	)
}

export function isLabelResponse(value: unknown): value is { label: Label } {
	return isRecord(value) && isLabel(value.label)
}

export function isLabelsResponse(value: unknown): value is { labels: Label[] } {
	return isRecord(value) && arrayOf(isLabel)(value.labels)
}

/** The error details the adapter may include in a failed response body. */
export function readApiError(body: unknown): { code?: string; detail?: string; upstreamError?: string } {
	if (!isRecord(body) || !isRecord(body.error)) return {}
	const { code, detail, upstream_err } = body.error
	return {
		code: isString(code) ? code : undefined,
		detail: isString(detail) ? detail : undefined,
		upstreamError: isString(upstream_err) ? upstream_err : undefined,
	}
}
