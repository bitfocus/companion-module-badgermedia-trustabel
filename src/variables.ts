import type { CompanionVariableDefinitions } from '@companion-module/base'
import type ModuleInstance from './main.js'
import { toLabelNumber, type HealthResponse, type Label, type PanelDetails, type SystemInfoResponse } from './api.js'
import { PANEL_NUMBERS } from './options.js'
import type { ModuleVariables, PanelVariableSuffix, PortNumber } from './types.js'

type VariableValues = Partial<ModuleVariables>
type VariableDefinitions = CompanionVariableDefinitions<ModuleVariables>

const LINES = [1, 2, 3, 4] as const

const PANEL_VARIABLE_NAMES: Record<PanelVariableSuffix, string> = {
	state: 'state',
	device_name: 'name',
	serial_number: 'serial number',
	firmware: 'firmware',
	mode: 'mode (single/dual)',
	orientation: 'orientation',
	screen_count: 'screen count',
	label_count: 'label count',
}

export function healthVariableValues(health: HealthResponse): VariableValues {
	const values: VariableValues = {
		adapter_model: health.model ?? '',
		adapter_firmware: health.firmware ?? '',
		adapter_build: health.build ?? '',
		adapter_uptime_s: health.uptime_s,
	}
	for (const port of health.ports) {
		values[`panel_${port.port}_state`] = port.state
	}
	return values
}

export function systemInfoVariableValues(info: SystemInfoResponse): VariableValues {
	const { adapter } = info
	const values: VariableValues = {
		adapter_serial_number: adapter.serial_number ?? '',
		adapter_hostname: adapter.hostname ?? '',
		adapter_mode: adapter.mode,
		adapter_ip: adapter.network?.ip ?? '',
		adapter_link: adapter.network?.link ?? '',
	}
	for (const port of info.ports) {
		values[`panel_${port.port}_state`] = port.state
		values[`panel_${port.port}_device_name`] = port.device_name ?? ''
		values[`panel_${port.port}_serial_number`] = port.serial_number ?? ''
		values[`panel_${port.port}_firmware`] = port.firmware ?? ''
	}
	return values
}

/** Details read from the panel itself, or blanks when there is no active panel on that port. */
export function panelVariableValues(panel: PortNumber, details: PanelDetails | null): VariableValues {
	const info = details?.info
	const values: VariableValues = {}
	values[`panel_${panel}_mode`] = info?.panel_mode ?? ''
	values[`panel_${panel}_orientation`] = info?.orientation ?? ''
	values[`panel_${panel}_screen_count`] = info?.screen_count
	values[`panel_${panel}_label_count`] = details?.labelTotal
	return values
}

export function labelVariableValues(panel: PortNumber, label: Label): VariableValues {
	const prefix = `panel_${panel}_label_${toLabelNumber(label.id)}` as const
	const values: VariableValues = {}
	values[`${prefix}_mode`] = label.mode
	values[`${prefix}_scale`] = label.scale
	values[`${prefix}_image`] = label.image
	values[`${prefix}_dynamic`] = label.dynamic
	values[`${prefix}_dyn_text`] = label.dyn_text ?? ''
	values[`${prefix}_dyn_color`] = label.dyn_c ?? ''
	values[`${prefix}_status`] = label.status ?? ''

	// Empty lines are dropped so the result can go straight onto a button without blank gaps.
	const text = label.lines
		.map((line) => line.t)
		.filter((line) => line !== '')
		.join('\n')
	values[`${prefix}_text`] = text
	values[`${prefix}_display_text`] = label.dynamic && label.dyn_text ? label.dyn_text : text

	for (const line of LINES) {
		values[`${prefix}_line${line}`] = label.lines[line - 1].t
		values[`${prefix}_line${line}_color`] = label.lines[line - 1].c
	}
	return values
}

function panelVariableDefinitions<P extends PortNumber>(
	panel: P,
): Record<`panel_${P}_${PanelVariableSuffix}`, { name: string }> {
	const entries = Object.entries(PANEL_VARIABLE_NAMES).map(([suffix, name]) => [
		`panel_${panel}_${suffix}`,
		{ name: `Panel ${panel}: ${name}` },
	])
	// Object.fromEntries can't keep the literal keys, so they are restated here.
	return Object.fromEntries(entries) as Record<`panel_${P}_${PanelVariableSuffix}`, { name: string }>
}

function addLabelVariableDefinitions(definitions: VariableDefinitions, panel: PortNumber, label: number): void {
	const prefix = `panel_${panel}_label_${label}` as const
	const name = `Panel ${panel} label ${label}`
	definitions[`${prefix}_text`] = { name: `${name}: all lines` }
	definitions[`${prefix}_display_text`] = { name: `${name}: dynamic text when in dynamic mode, otherwise all lines` }
	definitions[`${prefix}_mode`] = { name: `${name}: mode` }
	definitions[`${prefix}_scale`] = { name: `${name}: scale` }
	definitions[`${prefix}_image`] = { name: `${name}: image` }
	definitions[`${prefix}_dynamic`] = { name: `${name}: dynamic mode enabled` }
	definitions[`${prefix}_dyn_text`] = { name: `${name}: dynamic text` }
	definitions[`${prefix}_dyn_color`] = { name: `${name}: dynamic color` }
	definitions[`${prefix}_status`] = { name: `${name}: status` }
	for (const line of LINES) {
		definitions[`${prefix}_line${line}`] = { name: `${name}: line ${line} text` }
		definitions[`${prefix}_line${line}_color`] = { name: `${name}: line ${line} color` }
	}
}

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	const definitions: VariableDefinitions = {
		adapter_model: { name: 'Adapter: model' },
		adapter_firmware: { name: 'Adapter: firmware' },
		adapter_build: { name: 'Adapter: build' },
		adapter_uptime_s: { name: 'Adapter: uptime (seconds)' },
		adapter_serial_number: { name: 'Adapter: serial number' },
		adapter_hostname: { name: 'Adapter: hostname' },
		adapter_mode: { name: 'Adapter: mode (server/protocol)' },
		adapter_ip: { name: 'Adapter: IP address' },
		adapter_link: { name: 'Adapter: network link' },
		panel_count: { name: 'Number of active panels' },
		...panelVariableDefinitions(1),
		...panelVariableDefinitions(2),
		...panelVariableDefinitions(3),
		...panelVariableDefinitions(4),
	}

	for (const panel of PANEL_NUMBERS) {
		for (let label = 1; label <= self.labelCount(panel); label++) {
			addLabelVariableDefinitions(definitions, panel, label)
		}
	}

	self.setVariableDefinitions(definitions)
}
