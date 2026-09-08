import { combineRgb, type CompanionPresetDefinitions } from '@companion-module/base'
import type { ModuleInstance } from './main.js'

const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)

export function UpdatePresets(self: ModuleInstance): void {
	const presets: CompanionPresetDefinitions = {}

	presets['backlight'] = {
		type: 'button',
		category: 'Panel',
		name: 'Wake Backlight',
		style: { text: 'Wake\\nBacklight', size: '14', color: WHITE, bgcolor: BLACK },
		steps: [{ down: [{ actionId: 'backlight', options: {} }], up: [] }],
		feedbacks: [],
	}

	presets['flash_all_labels'] = {
		type: 'button',
		category: 'Identification',
		name: 'Flash All Labels',
		style: { text: 'Flash All Labels', size: '14', color: WHITE, bgcolor: BLACK },
		steps: [{ down: [{ actionId: 'flash_label', options: { lid: 'ALL', duration: 10 } }], up: [] }],
		feedbacks: [],
	}

	presets['flash_all_screens'] = {
		type: 'button',
		category: 'Identification',
		name: 'Flash All Screens',
		style: { text: 'Flash All Screens', size: '14', color: WHITE, bgcolor: BLACK },
		steps: [{ down: [{ actionId: 'flash_screen', options: { sid: 'ALL', duration: 10 } }], up: [] }],
		feedbacks: [],
	}

	for (let id = 0; id < self.labelCount; id++) {
		presets[`label_${id}`] = {
			type: 'button',
			category: 'Labels',
			name: `Label ${id}`,
			style: {
				text: `L${id}\\n$(${self.label}:label_${id}_line1)`,
				size: '14',
				color: WHITE,
				bgcolor: BLACK,
			},
			steps: [{ down: [{ actionId: 'spotlight_label', options: { lid: String(id), duration: 15 } }], up: [] }],
			feedbacks: [],
		}
	}

	self.setPresetDefinitions(presets)
}
