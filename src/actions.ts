import type {
	CompanionActionDefinitions,
	CompanionInputFieldDropdown,
	CompanionInputFieldTextInput,
} from '@companion-module/base'
import type ModuleInstance from './main.js'
import { toPanelText } from './text.js'
import {
	COLOR_CHOICES,
	DYNAMIC_MODE_CHOICES,
	LABEL_OPTION,
	LABELS_OPTION,
	LINE_OPTION,
	PERM_OPTION,
	panelOption,
	STATUS_CHOICES,
	durationOption,
	toggleOption,
} from './options.js'
import {
	toLabelId,
	type DynamicLabelFields,
	type LabelColor,
	type LabelId,
	type LabelLine,
	type LabelLines,
	type LabelPatch,
} from './api.js'
import type { ActionSchemas, LineIndex, PortNumber } from './types.js'

/** Roughly how long a panel or the adapter takes to come back, so the refresh after it sees the result. */
const POWER_CYCLE_REFRESH_MS = 10000
const REBOOT_REFRESH_MS = 30000

const FIRST_LINE_TOOLTIP = 'If line 1 is left empty the panel displays RECOVERED.'

/**
 * Expand `ALL` and comma separated label numbers (1-based, as users see them) into the explicit list
 * the API requires.
 */
export function parseLabelNumbers(raw: string, total: number): { numbers: number[]; rejected: string[] } {
	const entries = raw
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean)

	const numbers = new Set<number>()
	const rejected: string[] = []
	for (const entry of entries) {
		if (entry.toUpperCase() === 'ALL') {
			for (let n = 1; n <= total; n++) numbers.add(n)
		} else if (/^[1-9]\d*$/.test(entry)) {
			numbers.add(Number(entry))
		} else {
			rejected.push(entry)
		}
	}
	return { numbers: [...numbers].sort((a, b) => a - b), rejected }
}

function labelIdsFromOptions(self: ModuleInstance, actionName: string, panel: PortNumber, value: string): LabelId[] {
	const { numbers, rejected } = parseLabelNumbers(value, self.labelCount(panel))
	if (rejected.length > 0) {
		self.log('warn', `${actionName} ignored ${rejected.join(', ')}: use label numbers such as 1,2,3 or ALL`)
	}
	if (numbers.length === 0) self.log('warn', `${actionName}: no labels to send`)
	return numbers.map(toLabelId)
}

function panelLine(text: string, color: LabelColor): LabelLine {
	return { t: toPanelText(text), c: color }
}

function warnIfFirstLineEmpty(self: ModuleInstance, panel: PortNumber, label: number, lines: LabelLines): void {
	if (lines[0].t === '') {
		self.log('warn', `Panel ${panel} Label ${label}: line 1 is empty, so the panel will display RECOVERED`)
	}
}

async function setLabel(self: ModuleInstance, panel: PortNumber, patch: LabelPatch, perm: boolean): Promise<void> {
	await self.api.labelSet(self.requirePanel(panel).details.serial, patch, perm)
	await self.refreshLabel(panel, patch.id)
}

function lineTextOption<I extends LineIndex>(index: I): CompanionInputFieldTextInput<`text${I}`> {
	return {
		type: 'textinput',
		id: `text${index}`,
		label: `Line ${index + 1} Text`,
		tooltip: index === 0 ? FIRST_LINE_TOOLTIP : undefined,
		default: '',
		useVariables: true,
	}
}

function lineColorOption<I extends LineIndex>(index: I): CompanionInputFieldDropdown<`color${I}`, LabelColor> {
	return {
		type: 'dropdown',
		id: `color${index}`,
		label: `Line ${index + 1} Color`,
		default: 'white',
		choices: COLOR_CHOICES,
	}
}

export function UpdateActions(self: ModuleInstance): void {
	const PANEL_OPTION = panelOption(self.ports)

	const run = async (fn: () => Promise<void>): Promise<void> => {
		try {
			await fn()
		} catch (err) {
			self.reportActionError(err)
		}
	}

	const actions: CompanionActionDefinitions<ActionSchemas> = {
		flash_label: {
			name: 'Label - Flash',
			options: [PANEL_OPTION, LABELS_OPTION, durationOption(10)],
			callback: async ({ options }) =>
				run(async () => {
					const serial = self.requirePanel(options.panel).details.serial
					const ids = labelIdsFromOptions(self, 'Label - Flash', options.panel, options.labels)
					if (ids.length === 0) return
					await self.api.flashLabels(serial, ids, options.duration)
				}),
		},
		spotlight_label: {
			name: 'Label - Spotlight',
			options: [PANEL_OPTION, LABELS_OPTION, durationOption(15)],
			callback: async ({ options }) =>
				run(async () => {
					const serial = self.requirePanel(options.panel).details.serial
					const ids = labelIdsFromOptions(self, 'Label - Spotlight', options.panel, options.labels)
					if (ids.length === 0) return
					await self.api.spotlightLabels(serial, ids, options.duration)
				}),
		},
		label_set_line: {
			name: 'Label - Set One Line',
			options: [
				PANEL_OPTION,
				LABEL_OPTION,
				LINE_OPTION,
				{
					type: 'textinput',
					id: 'text',
					label: 'Text',
					tooltip: FIRST_LINE_TOOLTIP,
					default: '',
					useVariables: true,
				},
				{ type: 'dropdown', id: 'color', label: 'Color', default: 'white', choices: COLOR_CHOICES },
				PERM_OPTION,
			],
			callback: async ({ options }) =>
				run(async () => {
					const serial = self.requirePanel(options.panel).details.serial

					// `lines` must always carry all four entries, so the other three come from the panel.
					const id = toLabelId(options.label)
					const current = await self.api.labelGet(serial, id)
					const lines: LabelLines = [current.lines[0], current.lines[1], current.lines[2], current.lines[3]]
					lines[options.line] = panelLine(options.text, options.color)

					warnIfFirstLineEmpty(self, options.panel, options.label, lines)
					await setLabel(self, options.panel, { id, lines }, options.perm)
				}),
		},
		label_set_text: {
			name: 'Label - Set All Lines',
			options: [
				PANEL_OPTION,
				LABEL_OPTION,
				lineTextOption(0),
				lineColorOption(0),
				lineTextOption(1),
				lineColorOption(1),
				lineTextOption(2),
				lineColorOption(2),
				lineTextOption(3),
				lineColorOption(3),
				{ type: 'number', id: 'scale', label: 'Scale', default: 1, min: 0, max: 10, asInteger: true },
				PERM_OPTION,
			],
			callback: async ({ options }) =>
				run(async () => {
					const lines: LabelLines = [
						panelLine(options.text0, options.color0),
						panelLine(options.text1, options.color1),
						panelLine(options.text2, options.color2),
						panelLine(options.text3, options.color3),
					]
					warnIfFirstLineEmpty(self, options.panel, options.label, lines)
					await setLabel(
						self,
						options.panel,
						{ id: toLabelId(options.label), mode: 'text', lines, scale: options.scale },
						options.perm,
					)
				}),
		},
		label_set_image: {
			name: 'Label - Set Image Mode',
			options: [
				PANEL_OPTION,
				LABEL_OPTION,
				{
					type: 'textinput',
					id: 'image',
					label: 'Image filename',
					tooltip: 'An RGB565 .bin file already stored on the panel, for example logo.bin',
					default: '',
					useVariables: true,
				},
				PERM_OPTION,
			],
			callback: async ({ options }) =>
				run(async () =>
					setLabel(
						self,
						options.panel,
						{ id: toLabelId(options.label), mode: 'image', image: options.image.trim() },
						options.perm,
					),
				),
		},
		label_set_dynamic_enabled: {
			name: 'Label - Enable / Disable Dynamic Mode',
			options: [
				PANEL_OPTION,
				LABEL_OPTION,
				{
					type: 'dropdown',
					id: 'dynamic',
					label: 'Dynamic mode',
					default: 'toggle',
					choices: DYNAMIC_MODE_CHOICES,
				},
				PERM_OPTION,
			],
			callback: async ({ options }) =>
				run(async () => {
					const panel = self.requirePanel(options.panel)
					const id = toLabelId(options.label)
					let dynamic = options.dynamic === 'enable'
					if (options.dynamic === 'toggle') {
						// Labels outside the polled state are read first, so a toggle never guesses.
						const current = panel.labels.get(id) ?? (await self.api.labelGet(panel.details.serial, id))
						dynamic = !current.dynamic
					}
					await setLabel(self, options.panel, { id, dynamic }, options.perm)
				}),
		},
		label_dynamic: {
			name: 'Label - Show Dynamic Update',
			description:
				'Shows live text, color and/or status on a label, turning on its dynamic mode first if needed. Dynamic updates are not persisted.',
			options: [
				PANEL_OPTION,
				LABEL_OPTION,
				toggleOption('setText', 'Set dynamic text', true),
				{
					type: 'textinput',
					id: 'dyn_text',
					label: 'Dynamic text',
					default: '',
					useVariables: true,
					isVisibleExpression: '$(options:setText)',
				},
				toggleOption('setColor', 'Set dynamic color', true),
				{
					type: 'dropdown',
					id: 'dyn_c',
					label: 'Dynamic color',
					default: 'white',
					choices: COLOR_CHOICES,
					isVisibleExpression: '$(options:setColor)',
				},
				toggleOption('setStatus', 'Set status', true),
				{
					type: 'dropdown',
					id: 'status',
					label: 'Status',
					default: 'ok',
					choices: STATUS_CHOICES,
					isVisibleExpression: '$(options:setStatus)',
				},
			],
			callback: async ({ options }) =>
				run(async () => {
					const panel = self.requirePanel(options.panel)
					const serial = panel.details.serial
					const id = toLabelId(options.label)
					const fields: DynamicLabelFields = {}
					if (options.setText) fields.dyn_text = toPanelText(options.dyn_text)
					if (options.setColor) fields.dyn_c = options.dyn_c
					if (options.setStatus) fields.status = options.status
					if (Object.keys(fields).length === 0) {
						self.log(
							'warn',
							`Panel ${options.panel} label ${options.label}: Show Dynamic Update has nothing to set; tick at least one field`,
						)
						return
					}
					// The panel only accepts dynamic fields once dynamic mode is on (it rejects them with 409
					// otherwise, and label/set can't carry them), so the mode has to be turned on first.
					// Labels whose state isn't known yet are always switched on.
					if (panel.labels.get(id)?.dynamic !== true) {
						await self.api.labelSet(serial, { id, dynamic: true }, false)
					}
					await self.api.labelDynamic(serial, id, fields)
					await self.refreshLabel(options.panel, id)
				}),
		},
		label_dynamic_clear: {
			name: 'Label - Clear Dynamic Update',
			description:
				'Clears the dynamic text, resets the status to ok and turns dynamic mode off, so the label shows its static lines again.',
			options: [PANEL_OPTION, LABEL_OPTION],
			callback: async ({ options }) =>
				run(async () => {
					const panel = self.requirePanel(options.panel)
					const serial = panel.details.serial
					const id = toLabelId(options.label)
					// The panel rejects dynamic updates while dynamic mode is off, so only clear when it may be on.
					// Clearing first means the text and status don't reappear the next time dynamic mode is turned on.
					if (panel.labels.get(id)?.dynamic !== false) {
						await self.api.labelDynamic(serial, id, { dyn_text: '', status: 'ok' })
					}
					await self.api.labelSet(serial, { id, dynamic: false }, false)
					await self.refreshLabel(options.panel, id)
				}),
		},
		power_cycle: {
			name: 'Adapter - Power-Cycle Panel',
			description: 'Cuts and restores power to the panel on the chosen adapter port.',
			options: [PANEL_OPTION],
			callback: async ({ options }) =>
				run(async () => {
					await self.api.powerCycle(options.panel)
					self.scheduleRefresh(POWER_CYCLE_REFRESH_MS)
				}),
		},
		reboot: {
			name: 'Adapter - Reboot',
			description: 'Reboots the network adapter. The API is unavailable while it restarts.',
			options: [],
			callback: async () =>
				run(async () => {
					await self.api.reboot()
					self.expectRestart(REBOOT_REFRESH_MS)
				}),
		},
		refresh: {
			name: 'Panel - Refresh State',
			options: [],
			callback: async () => run(async () => self.refresh()),
		},
	}

	self.setActionDefinitions(actions)
}
