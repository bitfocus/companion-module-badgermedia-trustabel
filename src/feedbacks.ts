import { combineRgb, type CompanionFeedbackDefinitions } from '@companion-module/base'
import type { ModuleInstance } from './main.js'

export function UpdateFeedbacks(self: ModuleInstance): void {
	const feedbacks: CompanionFeedbackDefinitions = {
		label_dynamic_enabled: {
			name: 'Label - Dynamic Mode Enabled',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(0, 0, 200),
				color: combineRgb(255, 255, 255),
			},
			options: [{ type: 'number', id: 'id', label: 'Label ID', default: 0, min: 0, max: 255 }],
			callback: (feedback) => self.labels.get(Number(feedback.options.id))?.dynamic === true,
		},
		label_mode: {
			name: 'Label - Mode',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(0, 0, 200),
				color: combineRgb(255, 255, 255),
			},
			options: [
				{ type: 'number', id: 'id', label: 'Label ID', default: 0, min: 0, max: 255 },
				{
					type: 'dropdown',
					id: 'mode',
					label: 'Mode',
					default: 'text',
					choices: [
						{ id: 'text', label: 'Text' },
						{ id: 'image', label: 'Image' },
					],
				},
			],
			callback: (feedback) => self.labels.get(Number(feedback.options.id))?.mode === feedback.options.mode,
		},
		label_status: {
			name: 'Label - Status',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(200, 0, 0),
				color: combineRgb(255, 255, 255),
			},
			options: [
				{ type: 'number', id: 'id', label: 'Label ID', default: 0, min: 0, max: 255 },
				{ type: 'textinput', id: 'status', label: 'Status', default: 'error', useVariables: true },
			],
			callback: (feedback) =>
				(self.labels.get(Number(feedback.options.id))?.status ?? '') === String(feedback.options.status ?? '').trim(),
		},
		label_line_text: {
			name: 'Label - Line Text',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(0, 0, 200),
				color: combineRgb(255, 255, 255),
			},
			options: [
				{ type: 'number', id: 'id', label: 'Label ID', default: 0, min: 0, max: 255 },
				{
					type: 'dropdown',
					id: 'line',
					label: 'Line',
					default: 0,
					choices: [0, 1, 2, 3].map((i) => ({ id: i, label: `Line ${i + 1}` })),
				},
				{ type: 'textinput', id: 'text', label: 'Text', default: '', useVariables: true },
			],
			callback: (feedback) => {
				const label = self.labels.get(Number(feedback.options.id))
				return (label?.lines?.[Number(feedback.options.line)]?.t ?? '') === String(feedback.options.text ?? '').trim()
			},
		},
	}

	self.setFeedbackDefinitions(feedbacks)
}
