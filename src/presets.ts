import {
	combineRgb,
	type CompanionButtonStepActions,
	type CompanionPresetDefinitions,
	type CompanionPresetGroup,
	type CompanionPresetSection,
	type SomePresetActionEntry,
} from '@companion-module/base'
import type ModuleInstance from './main.js'
import { PANEL_NUMBERS, panelLabel } from './options.js'
import type { ModuleTypes, PortNumber } from './types.js'

type Presets = CompanionPresetDefinitions<ModuleTypes>
type Group = CompanionPresetGroup<ModuleTypes>
type Step = CompanionButtonStepActions<ModuleTypes>
type Action = SomePresetActionEntry<ModuleTypes>

const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)
const RED = combineRgb(200, 0, 0)
const GREEN = combineRgb(0, 150, 0)
const BLUE = combineRgb(0, 0, 200)
const AMBER = combineRgb(200, 120, 0)

/** Destructive actions only fire once the button has been held this long. */
const HOLD_MS = 2000

/** The label the example action presets act on; users change it after adding the button. */
const EXAMPLE_LABEL = 1

const pressStep = (...down: Action[]): Step => ({ down, up: [] })

const holdStep = (...actions: Action[]): Step => ({
	down: [],
	up: [],
	[HOLD_MS]: { options: { runWhileHeld: true }, actions },
})

const style = (text: string, size: 'auto' | '14' | '18', bgcolor: number) => ({
	text,
	size,
	color: WHITE,
	bgcolor,
	show_topbar: false,
})

function adapterSection(self: ModuleInstance, presets: Presets): CompanionPresetSection<ModuleTypes> {
	const v = (variable: string) => `$(${self.label}:${variable})`
	presets.adapter_info = {
		type: 'simple',
		name: 'Adapter Info',
		style: style(`${v('adapter_model')}\\n${v('adapter_firmware')}\\n${v('adapter_mode')}`, 'auto', BLACK),
		steps: [pressStep()],
		feedbacks: [],
	}
	presets.adapter_network = {
		type: 'simple',
		name: 'Adapter Network',
		style: style(`${v('adapter_hostname')}\\n${v('adapter_ip')}\\n${v('adapter_link')}`, 'auto', BLACK),
		steps: [pressStep()],
		feedbacks: [],
	}
	presets.adapter_panels = {
		type: 'simple',
		name: 'Active Panels',
		style: style(`Panels\\n${v('panel_count')}`, '18', BLACK),
		steps: [pressStep()],
		feedbacks: [],
	}
	presets.adapter_refresh = {
		type: 'simple',
		name: 'Refresh State',
		style: style('Refresh', '14', BLACK),
		steps: [pressStep({ actionId: 'refresh', options: {} })],
		feedbacks: [],
	}
	presets.adapter_reboot = {
		type: 'simple',
		name: 'Reboot Adapter (hold 2s)',
		style: style('Reboot\\nAdapter\\n(hold)', '14', RED),
		steps: [holdStep({ actionId: 'reboot', options: {} })],
		feedbacks: [],
	}
	return {
		id: 'adapter',
		name: 'Adapter Info',
		definitions: ['adapter_info', 'adapter_network', 'adapter_panels', 'adapter_refresh', 'adapter_reboot'],
	}
}

function labelsGroup(self: ModuleInstance, panel: PortNumber, presets: Presets): Group {
	const ids: string[] = []
	for (let label = 1; label <= self.labelCount(panel); label++) {
		const presetId = `panel_${panel}_label_${label}`
		ids.push(presetId)
		presets[presetId] = {
			type: 'simple',
			name: `Label ${label}`,
			style: style(`LABEL ${label}\\n$(${self.label}:panel_${panel}_label_${label}_display_text)`, 'auto', BLACK),
			steps: [pressStep({ actionId: 'spotlight_label', options: { panel, labels: String(label), duration: 15 } })],
			feedbacks: [{ feedbackId: 'label_status', options: { panel, label, status: 'error' }, style: { bgcolor: RED } }],
		}
	}
	return {
		id: `panel_${panel}_labels`,
		type: 'simple',
		name: 'Labels',
		description: 'What each label currently displays. Press to spotlight it.',
		presets: ids,
	}
}

function labelDetailsGroup(self: ModuleInstance, panel: PortNumber, presets: Presets): Group {
	const ids: string[] = []
	for (let label = 1; label <= self.labelCount(panel); label++) {
		const presetId = `panel_${panel}_label_${label}_details`
		const v = (suffix: string) => `$(${self.label}:panel_${panel}_label_${label}_${suffix})`
		ids.push(presetId)
		presets[presetId] = {
			type: 'simple',
			name: `Label ${label} Details`,
			style: style(`LABEL ${label}\\n${v('mode')}\\n${v('status')}\\n${v('dyn_text')}`, 'auto', BLACK),
			steps: [pressStep()],
			feedbacks: [
				{ feedbackId: 'label_dynamic_enabled', options: { panel, label }, style: { bgcolor: BLUE } },
				{ feedbackId: 'label_status', options: { panel, label, status: 'warning' }, style: { bgcolor: AMBER } },
				{ feedbackId: 'label_status', options: { panel, label, status: 'error' }, style: { bgcolor: RED } },
			],
		}
	}
	return {
		id: `panel_${panel}_label_details`,
		type: 'simple',
		name: 'Label Details',
		description: 'Mode, status and dynamic text. Blue in dynamic mode. Amber on warning. Red on error.',
		presets: ids,
	}
}

function identificationGroup(panel: PortNumber, presets: Presets): Group {
	const flashId = `panel_${panel}_flash_all`
	const spotlightId = `panel_${panel}_spotlight_all`
	presets[flashId] = {
		type: 'simple',
		name: 'Flash All Labels',
		style: style('Flash\\nALL', '14', BLACK),
		steps: [pressStep({ actionId: 'flash_label', options: { panel, labels: 'ALL', duration: 10 } })],
		feedbacks: [],
	}
	presets[spotlightId] = {
		type: 'simple',
		name: 'Spotlight All Labels',
		style: style('Spotlight\\nALL', '14', BLACK),
		steps: [pressStep({ actionId: 'spotlight_label', options: { panel, labels: 'ALL', duration: 15 } })],
		feedbacks: [],
	}
	return {
		id: `panel_${panel}_identification`,
		type: 'simple',
		name: 'Identification',
		presets: [flashId, spotlightId],
	}
}

function labelActionsGroup(panel: PortNumber, presets: Presets): Group {
	const label = EXAMPLE_LABEL
	const id = (name: string) => `panel_${panel}_${name}`

	presets[id('set_line')] = {
		type: 'simple',
		name: 'Set One Line',
		style: style(`Set LABEL ${label}\\nLine 1 Text`, '14', BLACK),
		steps: [
			pressStep({
				actionId: 'label_set_line',
				options: { panel, label, line: 0, text: 'Example Text', color: 'red', perm: false },
			}),
		],
		feedbacks: [
			{
				feedbackId: 'label_line_text',
				options: { panel, label, line: 0, text: 'LIVE' },
				style: { bgcolor: GREEN },
			},
		],
	}
	presets[id('set_text')] = {
		type: 'simple',
		name: 'Set All Lines',
		style: style(`Set LABEL ${label}\\nText`, '14', BLACK),
		steps: [
			pressStep({
				actionId: 'label_set_text',
				options: {
					panel,
					label,
					text0: 'Example Text',
					color0: 'white',
					text1: 'STUDIO A',
					color1: 'grey',
					text2: '',
					color2: '',
					text3: '',
					color3: '',
					scale: 3,
					perm: false,
				},
			}),
		],
		feedbacks: [
			{
				feedbackId: 'label_line_text',
				options: { panel, label, line: 0, text: 'CAM 1' },
				style: { bgcolor: GREEN },
			},
		],
	}
	presets[id('set_image')] = {
		type: 'simple',
		name: 'Set Image Mode',
		style: style(`LABEL ${label}\\nImage`, '14', BLACK),
		steps: [pressStep({ actionId: 'label_set_image', options: { panel, label, image: 'logo.bin', perm: false } })],
		feedbacks: [{ feedbackId: 'label_mode', options: { panel, label, mode: 'image' }, style: { bgcolor: GREEN } }],
	}
	presets[id('dynamic_toggle')] = {
		type: 'simple',
		name: 'Toggle Dynamic Mode',
		style: style(`LABEL ${label}\\nDynamic\\nToggle`, '14', BLACK),
		steps: [
			pressStep({ actionId: 'label_set_dynamic_enabled', options: { panel, label, dynamic: 'toggle', perm: false } }),
		],
		feedbacks: [{ feedbackId: 'label_dynamic_enabled', options: { panel, label }, style: { bgcolor: BLUE } }],
	}
	presets[id('dynamic_on')] = {
		type: 'simple',
		name: 'Enable Dynamic Mode',
		style: style(`LABEL ${label}\\nDynamic\\nOn`, '14', BLACK),
		steps: [
			pressStep({ actionId: 'label_set_dynamic_enabled', options: { panel, label, dynamic: 'enable', perm: false } }),
		],
		feedbacks: [{ feedbackId: 'label_dynamic_enabled', options: { panel, label }, style: { bgcolor: BLUE } }],
	}
	presets[id('dynamic_off')] = {
		type: 'simple',
		name: 'Disable Dynamic Mode',
		style: style(`LABEL ${label}\\nDynamic\\nOff`, '14', BLACK),
		steps: [
			pressStep({ actionId: 'label_set_dynamic_enabled', options: { panel, label, dynamic: 'disable', perm: false } }),
		],
		feedbacks: [{ feedbackId: 'label_dynamic_enabled', options: { panel, label }, style: { bgcolor: BLUE } }],
	}
	presets[id('show_dynamic')] = {
		type: 'simple',
		name: 'Show Dynamic Update',
		style: style(`LABEL ${label}\\nDynamic Update`, '14', BLACK),
		steps: [
			pressStep({
				actionId: 'label_dynamic',
				options: {
					panel,
					label,
					setText: true,
					dyn_text: 'DYNAMIC TEXT',
					setColor: true,
					dyn_c: 'red',
					setStatus: true,
					status: 'error',
				},
			}),
		],
		feedbacks: [{ feedbackId: 'label_dynamic_enabled', options: { panel, label }, style: { bgcolor: BLUE } }],
	}
	presets[id('clear_dynamic')] = {
		type: 'simple',
		name: 'Clear Dynamic Update',
		style: style(`LABEL ${label}\\nClear\\nDynamic`, '14', BLACK),
		steps: [pressStep({ actionId: 'label_dynamic_clear', options: { panel, label } })],
		feedbacks: [],
	}

	return {
		id: `panel_${panel}_label_actions`,
		type: 'simple',
		name: 'Label Actions',
		description: `Examples modifying a label ${label}. You can change the label option after adding one to modify a different label.`,
		presets: [
			'set_line',
			'set_text',
			'set_image',
			'dynamic_toggle',
			'dynamic_on',
			'dynamic_off',
			'show_dynamic',
			'clear_dynamic',
		].map(id),
	}
}

function panelGroup(self: ModuleInstance, panel: PortNumber, presets: Presets): Group {
	const v = (suffix: string) => `$(${self.label}:panel_${panel}_${suffix})`
	const statusId = `panel_${panel}_status`
	const infoId = `panel_${panel}_info`
	const layoutId = `panel_${panel}_layout`
	const powerCycleId = `panel_${panel}_power_cycle`

	presets[statusId] = {
		type: 'simple',
		name: 'Panel State',
		style: style(`${v('device_name')}\\n${v('state')}`, 'auto', BLACK),
		steps: [pressStep({ actionId: 'refresh', options: {} })],
		feedbacks: [
			{ feedbackId: 'panel_state', options: { panel, state: 'active' }, style: { bgcolor: GREEN } },
			{ feedbackId: 'panel_state', options: { panel, state: 'fault' }, style: { bgcolor: RED } },
			{ feedbackId: 'panel_state', options: { panel, state: 'config_error' }, style: { bgcolor: RED } },
		],
	}
	presets[infoId] = {
		type: 'simple',
		name: 'Panel Info',
		style: style(`${v('serial_number')}\\n${v('firmware')}`, 'auto', BLACK),
		steps: [pressStep()],
		feedbacks: [],
	}
	presets[layoutId] = {
		type: 'simple',
		name: 'Panel Layout',
		style: style(
			`${v('mode')} ${v('orientation')}\\n${v('screen_count')} screens\\n${v('label_count')} labels`,
			'auto',
			BLACK,
		),
		steps: [pressStep()],
		feedbacks: [],
	}
	presets[powerCycleId] = {
		type: 'simple',
		name: 'Power-Cycle Panel (hold 2s)',
		style: style('Power\\nCycle\\n(hold)', '14', RED),
		steps: [holdStep({ actionId: 'power_cycle', options: { panel } })],
		feedbacks: [],
	}
	return {
		id: `panel_${panel}_panel`,
		type: 'simple',
		name: 'Panel Info',
		presets: [statusId, infoId, layoutId, powerCycleId],
	}
}

export function UpdatePresets(self: ModuleInstance): void {
	const presets: Presets = {}
	const structure: CompanionPresetSection<ModuleTypes>[] = []

	for (const panel of PANEL_NUMBERS) {
		if (!self.panels.has(panel)) continue
		structure.push({
			id: `panel_${panel}`,
			name: panelLabel(panel, self.ports.get(panel)),
			definitions: [
				labelsGroup(self, panel, presets),
				labelDetailsGroup(self, panel, presets),
				identificationGroup(panel, presets),
				labelActionsGroup(panel, presets),
				panelGroup(self, panel, presets),
			],
		})
	}
	structure.push(adapterSection(self, presets))

	self.setPresetDefinitions(structure, presets)
}
