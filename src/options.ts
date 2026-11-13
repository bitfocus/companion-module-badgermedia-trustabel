import type {
	CompanionInputFieldCheckbox,
	CompanionInputFieldDropdown,
	CompanionInputFieldNumber,
	CompanionInputFieldTextInput,
	DropdownChoice,
} from '@companion-module/base'
import { LABEL_STATUSES, type LabelColor, type LabelStatus, type PortInfo, type PortState } from './api.js'
import type { DynamicModeChange, LineIndex, PortNumber } from './types.js'

export const COLOR_CHOICES: DropdownChoice<LabelColor>[] = [
	{ id: 'white', label: 'White' },
	{ id: 'grey', label: 'Grey' },
	{ id: 'red', label: 'Red' },
	{ id: 'green', label: 'Green' },
	{ id: 'blue', label: 'Blue' },
	{ id: 'yellow', label: 'Yellow' },
	{ id: 'cyan', label: 'Cyan' },
	{ id: 'magenta', label: 'Magenta' },
	{ id: 'orange', label: 'Orange' },
	{ id: '', label: 'None' },
]

const STATUS_LABELS: Record<LabelStatus, string> = {
	ok: 'OK',
	error: 'Error',
	warning: 'Warning',
	idle: 'Idle',
	unknown: 'Unknown',
}

export const STATUS_CHOICES: DropdownChoice<LabelStatus>[] = LABEL_STATUSES.map((status) => ({
	id: status,
	label: STATUS_LABELS[status],
}))

/** Panel numbers are the adapter's port numbers. */
export const PANEL_NUMBERS: readonly PortNumber[] = [1, 2, 3, 4]

/** "Panel 1 – Studio Rack A", or why there is no usable panel on that adapter port. */
export function panelLabel(panel: PortNumber, port: PortInfo | undefined): string {
	if (port?.state === 'active') return port.device_name ? `Panel ${panel} – ${port.device_name}` : `Panel ${panel}`
	if (!port || port.state === 'disconnected') return `Panel ${panel} (no panel)`
	return `Panel ${panel} (${port.state.replace('_', ' ')})`
}

export const PORT_STATE_CHOICES: DropdownChoice<PortState>[] = [
	{ id: 'active', label: 'Active' },
	{ id: 'connected', label: 'Connected' },
	{ id: 'disconnected', label: 'Disconnected' },
	{ id: 'fault', label: 'Fault' },
	{ id: 'config_error', label: 'Config error' },
	{ id: 'disabled', label: 'Disabled' },
]

export const LINE_CHOICES: DropdownChoice<LineIndex>[] = [
	{ id: 0, label: 'Line 1' },
	{ id: 1, label: 'Line 2' },
	{ id: 2, label: 'Line 3' },
	{ id: 3, label: 'Line 4' },
]

export const DYNAMIC_MODE_CHOICES: DropdownChoice<DynamicModeChange>[] = [
	{ id: 'toggle', label: 'Toggle' },
	{ id: 'enable', label: 'Enable' },
	{ id: 'disable', label: 'Disable' },
]

export const LABEL_MODE_CHOICES: DropdownChoice<'text' | 'image'>[] = [
	{ id: 'text', label: 'Text' },
	{ id: 'image', label: 'Image' },
]

/** Labels are numbered from 1 for users; the API's IDs start at 0. */
export const LABEL_OPTION: CompanionInputFieldNumber<'label'> = {
	type: 'number',
	id: 'label',
	label: 'Label',
	default: 1,
	min: 1,
	max: 255,
	asInteger: true,
}

export const LABELS_OPTION: CompanionInputFieldTextInput<'labels'> = {
	type: 'textinput',
	id: 'labels',
	label: 'Labels (comma separated, or ALL)',
	default: 'ALL',
	useVariables: true,
}

export const LINE_OPTION: CompanionInputFieldDropdown<'line', LineIndex> = {
	type: 'dropdown',
	id: 'line',
	label: 'Line',
	default: 0,
	choices: LINE_CHOICES,
}

/** Which panel to act on; panel numbers are the adapter's port numbers. */
export function panelOption(
	ports: ReadonlyMap<PortNumber, PortInfo>,
): CompanionInputFieldDropdown<'panel', PortNumber> {
	return {
		type: 'dropdown',
		id: 'panel',
		label: 'Panel',
		default: 1,
		choices: PANEL_NUMBERS.map((panel) => ({ id: panel, label: panelLabel(panel, ports.get(panel)) })),
	}
}

export const PERM_OPTION: CompanionInputFieldCheckbox<'perm'> = {
	type: 'checkbox',
	id: 'perm',
	label: 'Persist Changes',
	tooltip: 'Save the panel configuration to internal flash so the change survives a power cycle.',
	default: false,
}

/** The panel accepts flash and spotlight durations of 1 to 60 seconds. */
export function durationOption(defaultValue: number): CompanionInputFieldNumber<'duration'> {
	return {
		type: 'number',
		id: 'duration',
		label: 'Duration (seconds)',
		default: defaultValue,
		min: 1,
		max: 60,
		asInteger: true,
		clampValues: true,
	}
}

/** A checkbox that other options' visibility depends on, so it can't itself become an expression. */
export function toggleOption<TKey extends string>(
	id: TKey,
	label: string,
	defaultValue: boolean,
): CompanionInputFieldCheckbox<TKey> {
	return { type: 'checkbox', id, label, default: defaultValue, disableAutoExpression: true }
}
