import type { CompanionActionDefinitions } from '@companion-module/base'
import type { ModuleInstance } from './main.js'
import type { LabelLine, LabelObject } from './api.js'

const COLOR_CHOICES = [
	{ id: 'white', label: 'White' },
	{ id: 'grey', label: 'Grey' },
	{ id: 'red', label: 'Red' },
	{ id: 'green', label: 'Green' },
	{ id: 'blue', label: 'Blue' },
	{ id: 'yellow', label: 'Yellow' },
	{ id: 'cyan', label: 'Cyan' },
	{ id: 'magenta', label: 'Magenta' },
	{ id: 'orange', label: 'Orange' },
]

const PERM_OPTION = {
	type: 'checkbox' as const,
	id: 'perm',
	label: 'Persist Changes',
	tooltip: 'Save the panel configuration to internal flash so the change survives a power cycle.',
	default: false,
}

const SCREEN_STATE_CHOICES = [
	{ id: '1', label: 'On' },
	{ id: '0', label: 'Off' },
]

function durationOption(defaultValue: number) {
	return {
		type: 'number' as const,
		id: 'duration',
		label: 'Duration (seconds)',
		default: defaultValue,
		min: 1,
		max: 60,
	}
}

function toText(value: unknown): string {
	if (typeof value === 'string') return value
	if (typeof value === 'number' || typeof value === 'boolean') return String(value)
	return value === null || value === undefined ? '' : JSON.stringify(value)
}

function parse(value: unknown): string {
	return toText(value).trim()
}

function parseNumber(value: unknown): number {
	return Number(parse(value))
}

/**
 * Build `screen_id:state,...` for /screens/display from a shared ID list and On/Off.
 *
 * Unlike the flash and spotlight endpoints, /screens/display only accepts explicit numeric screen
 * ids, so anything else (notably a legacy `ALL`) is dropped with a warning rather than sent on.
 */
function screenDisplayPairsFromOptions(self: ModuleInstance, options: Record<string, unknown>): string {
	const state = options.state === '0' ? '0' : '1'
	const entries = parse(options.sid)
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean)

	const ids = entries.filter((id) => /^\d+$/.test(id))
	const rejected = entries.filter((id) => !/^\d+$/.test(id))
	if (rejected.length > 0) {
		self.log(
			'warn',
			`Screens - Set Display State ignored ${rejected.join(', ')}: this action needs explicit screen IDs, for example 0,1,2`,
		)
	}

	return ids.map((id) => `${id}:${state}`).join(',')
}

/**
 * label_set requires the complete label object, so start from the panel's current state and apply
 * only the fields this action changes.
 */
async function withCurrentLabel(
	self: ModuleInstance,
	id: number,
	mutate: (label: LabelObject) => void,
	perm: boolean,
): Promise<void> {
	const current = await self.api.labelGet(id)
	const lines: LabelLine[] = []
	for (let i = 0; i < 4; i++) {
		lines.push({ t: current.lines?.[i]?.t ?? '', c: current.lines?.[i]?.c ?? '' })
	}

	const label: LabelObject = {
		id: current.id ?? id,
		mode: current.mode ?? 'text',
		lines,
		image: current.image ?? '',
		scale: current.scale ?? 1,
		dynamic: current.dynamic ?? false,
	}

	mutate(label)

	await self.api.labelSet(label, perm)
	await self.refreshLabel(id)
}

export function UpdateActions(self: ModuleInstance): void {
	const run = async (fn: () => Promise<void>): Promise<void> => {
		try {
			await fn()
		} catch (err) {
			self.handleApiError(err)
		}
	}

	const actions: CompanionActionDefinitions = {
		backlight: {
			name: 'Panel - Wake Backlight',
			options: [],
			callback: async () => run(async () => self.api.backlight()),
		},
		screens_display: {
			name: 'Screens - Set Display State',
			options: [
				{
					type: 'textinput',
					id: 'sid',
					label: 'Screen IDs (comma separated)',
					tooltip: 'This endpoint has no ALL target; list each screen ID, for example 0,1,2',
					default: '0',
					useVariables: true,
				},
				{
					type: 'dropdown',
					id: 'state',
					label: 'State',
					default: '1',
					choices: SCREEN_STATE_CHOICES,
				},
			],
			callback: async (event) =>
				run(async () => {
					const pairs = screenDisplayPairsFromOptions(self, event.options)
					if (!pairs) return
					await self.api.screensDisplay(pairs)
				}),
		},
		flash_screen: {
			name: 'Screen - Flash',
			options: [
				{
					type: 'textinput',
					id: 'sid',
					label: 'Screen IDs (comma separated, or ALL)',
					default: 'ALL',
					useVariables: true,
				},
				durationOption(10),
			],
			callback: async (event) =>
				run(async () => self.api.flashScreen(parse(event.options.sid), Number(event.options.duration))),
		},
		spotlight_screen: {
			name: 'Screen - Spotlight',
			options: [
				{
					type: 'textinput',
					id: 'sid',
					label: 'Screen IDs (comma separated, or ALL)',
					default: 'ALL',
					useVariables: true,
				},
				durationOption(5),
			],
			callback: async (event) =>
				run(async () => self.api.spotlightScreen(parse(event.options.sid), Number(event.options.duration))),
		},
		flash_label: {
			name: 'Label - Flash',
			options: [
				{
					type: 'textinput',
					id: 'lid',
					label: 'Label IDs (comma separated, or ALL)',
					default: 'ALL',
					useVariables: true,
				},
				durationOption(10),
			],
			callback: async (event) =>
				run(async () => self.api.flashLabel(parse(event.options.lid), Number(event.options.duration))),
		},
		spotlight_label: {
			name: 'Label - Spotlight',
			options: [
				{
					type: 'textinput',
					id: 'lid',
					label: 'Label IDs (comma separated, or ALL)',
					default: 'ALL',
					useVariables: true,
				},
				durationOption(15),
			],
			callback: async (event) =>
				run(async () => self.api.spotlightLabel(parse(event.options.lid), Number(event.options.duration))),
		},
		label_set_line: {
			name: 'Label - Set One Line',
			options: [
				{ type: 'textinput', id: 'id', label: 'Label ID', default: '0', useVariables: true },
				{
					type: 'dropdown',
					id: 'line',
					label: 'Line',
					default: 0,
					choices: [0, 1, 2, 3].map((i) => ({ id: i, label: `Line ${i + 1}` })),
				},
				{ type: 'textinput', id: 'text', label: 'Text', default: '', useVariables: true },
				{
					type: 'dropdown',
					id: 'color',
					label: 'Color',
					default: 'white',
					choices: COLOR_CHOICES,
					allowCustom: true,
				},
				PERM_OPTION,
			],
			callback: async (event) =>
				run(async () => {
					const id = parseNumber(event.options.id)
					const line = Number(event.options.line)
					const text = parse(event.options.text)
					const color = parse(event.options.color)
					await withCurrentLabel(
						self,
						id,
						(label) => {
							label.lines[line] = { t: text, c: color }
						},
						Boolean(event.options.perm),
					)
				}),
		},
		label_set_text: {
			name: 'Label - Set All Lines',
			options: [
				{ type: 'textinput', id: 'id', label: 'Label ID', default: '0', useVariables: true },
				...[0, 1, 2, 3].flatMap((i) => [
					{
						type: 'textinput' as const,
						id: `text${i}`,
						label: `Line ${i + 1} text`,
						default: '',
						useVariables: true,
					},
					{
						type: 'dropdown' as const,
						id: `color${i}`,
						label: `Line ${i + 1} color`,
						default: 'white',
						choices: COLOR_CHOICES,
						allowCustom: true,
					},
				]),
				{
					type: 'number',
					id: 'scale',
					label: 'Scale',
					default: 1,
					min: 1,
					max: 8,
				},
				PERM_OPTION,
			],
			callback: async (event) =>
				run(async () => {
					const id = parseNumber(event.options.id)
					const lines: LabelLine[] = []
					for (let i = 0; i < 4; i++) {
						lines.push({
							t: parse(event.options[`text${i}`]),
							c: parse(event.options[`color${i}`]),
						})
					}
					await withCurrentLabel(
						self,
						id,
						(label) => {
							label.mode = 'text'
							label.lines = lines
							label.scale = Number(event.options.scale)
						},
						Boolean(event.options.perm),
					)
				}),
		},
		label_set_image: {
			name: 'Label - Set Image Mode',
			options: [
				{ type: 'textinput', id: 'id', label: 'Label ID', default: '0', useVariables: true },
				{
					type: 'textinput',
					id: 'image',
					label: 'Image filename',
					tooltip: 'An RGB565 .bin file already stored on the panel, for example /img.bin',
					default: '',
					useVariables: true,
				},
				PERM_OPTION,
			],
			callback: async (event) =>
				run(async () => {
					const id = parseNumber(event.options.id)
					const image = parse(event.options.image)
					await withCurrentLabel(
						self,
						id,
						(label) => {
							label.mode = 'image'
							label.image = image
						},
						Boolean(event.options.perm),
					)
				}),
		},
		label_set_dynamic_enabled: {
			name: 'Label- Enable / Disable Dynamic Mode',
			options: [
				{ type: 'textinput', id: 'id', label: 'Label ID', default: '0', useVariables: true },
				{ type: 'checkbox', id: 'dynamic', label: 'Dynamic mode enabled', default: true },
				PERM_OPTION,
			],
			callback: async (event) =>
				run(async () => {
					const id = parseNumber(event.options.id)
					await withCurrentLabel(
						self,
						id,
						(label) => {
							label.dynamic = Boolean(event.options.dynamic)
						},
						Boolean(event.options.perm),
					)
				}),
		},
		label_dynamic: {
			name: 'Label - Dynamic Update',
			options: [
				{ type: 'textinput', id: 'id', label: 'Label ID', default: '0', useVariables: true },
				{ type: 'checkbox', id: 'setText', label: 'Set dynamic text', default: true },
				{
					type: 'textinput',
					id: 'dyn_text',
					label: 'Dynamic text',
					default: '',
					useVariables: true,
					isVisibleExpression: '$(options:setText)',
				},
				{ type: 'checkbox', id: 'setColor', label: 'Set dynamic color', default: false },
				{
					type: 'dropdown',
					id: 'dyn_c',
					label: 'Dynamic colour',
					default: 'white',
					choices: COLOR_CHOICES,
					allowCustom: true,
					isVisibleExpression: '$(options:setColor)',
				},
				{ type: 'checkbox', id: 'setStatus', label: 'Set status', default: false },
				{
					type: 'textinput',
					id: 'status',
					label: 'Status',
					tooltip: 'For example ok, warn or error.',
					default: '',
					useVariables: true,
					isVisibleExpression: '$(options:setStatus)',
				},
			],
			callback: async (event) =>
				run(async () => {
					const id = parseNumber(event.options.id)
					const fields: { dyn_text?: string; dyn_c?: string; status?: string } = {}
					if (event.options.setText) fields.dyn_text = parse(event.options.dyn_text)
					if (event.options.setColor) fields.dyn_c = parse(event.options.dyn_c)
					if (event.options.setStatus) fields.status = parse(event.options.status)
					await self.api.labelDynamic(id, fields)
					await self.refreshLabel(id)
				}),
		},
		panel_set: {
			name: 'Panel - Set Mode & Orientation',
			description: 'Note: The panel will reboot to apply the new mode and orientation.',
			options: [
				{
					type: 'dropdown',
					id: 'panel_mode',
					label: 'Panel mode',
					default: 'single',
					choices: [
						{ id: 'single', label: 'Single' },
						{ id: 'dual', label: 'Dual' },
					],
				},
				{
					type: 'dropdown',
					id: 'orientation',
					label: 'Orientation',
					default: 'above',
					choices: [
						{ id: 'above', label: 'Above' },
						{ id: 'below', label: 'Below' },
					],
				},
			],
			callback: async (event) =>
				run(async () =>
					self.api.panelSet(
						event.options.panel_mode as 'single' | 'dual',
						event.options.orientation as 'above' | 'below',
					),
				),
		},
		refresh: {
			name: 'Panel - Refresh State',
			options: [],
			callback: async () => run(async () => self.poll()),
		},
	}

	self.setActionDefinitions(actions)
}
