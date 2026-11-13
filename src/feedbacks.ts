import { combineRgb, type CompanionFeedbackDefinitions } from '@companion-module/base'
import type ModuleInstance from './main.js'
import { toLabelId } from './api.js'
import type { FeedbackSchemas, PortNumber } from './types.js'
import {
	LABEL_OPTION,
	LABEL_MODE_CHOICES,
	LINE_OPTION,
	PORT_STATE_CHOICES,
	panelOption,
	STATUS_CHOICES,
} from './options.js'

export function UpdateFeedbacks(self: ModuleInstance): void {
	const PANEL_OPTION = panelOption(self.ports)
	const labelOf = (options: { panel: PortNumber; label: number }) =>
		self.panels.get(options.panel)?.labels.get(toLabelId(options.label))

	const feedbacks: CompanionFeedbackDefinitions<FeedbackSchemas> = {
		label_dynamic_enabled: {
			name: 'Label - Dynamic Mode Enabled',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(0, 0, 200),
				color: combineRgb(255, 255, 255),
			},
			options: [PANEL_OPTION, LABEL_OPTION],
			callback: (feedback) => labelOf(feedback.options)?.dynamic === true,
		},
		label_mode: {
			name: 'Label - Mode',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(0, 0, 200),
				color: combineRgb(255, 255, 255),
			},
			options: [
				PANEL_OPTION,
				LABEL_OPTION,
				{
					type: 'dropdown',
					id: 'mode',
					label: 'Mode',
					default: 'text',
					choices: LABEL_MODE_CHOICES,
				},
			],
			callback: (feedback) => labelOf(feedback.options)?.mode === feedback.options.mode,
		},
		label_status: {
			name: 'Label - Status',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(200, 0, 0),
				color: combineRgb(255, 255, 255),
			},
			options: [
				PANEL_OPTION,
				LABEL_OPTION,
				{ type: 'dropdown', id: 'status', label: 'Status', default: 'error', choices: STATUS_CHOICES },
			],
			callback: (feedback) => labelOf(feedback.options)?.status === feedback.options.status,
		},
		label_line_text: {
			name: 'Label - Line Text',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(0, 0, 200),
				color: combineRgb(255, 255, 255),
			},
			options: [
				PANEL_OPTION,
				LABEL_OPTION,
				LINE_OPTION,
				{ type: 'textinput', id: 'text', label: 'Text', default: '', useVariables: true },
			],
			callback: (feedback) => {
				const label = labelOf(feedback.options)
				return (label?.lines[feedback.options.line]?.t ?? '') === feedback.options.text.trim()
			},
		},
		panel_state: {
			name: 'Panel - State',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(0, 200, 0),
				color: combineRgb(255, 255, 255),
			},
			options: [
				PANEL_OPTION,
				{
					type: 'dropdown',
					id: 'state',
					label: 'State',
					default: 'active',
					choices: PORT_STATE_CHOICES,
				},
			],
			callback: (feedback) => self.portState(feedback.options.panel) === feedback.options.state,
		},
	}

	self.setFeedbackDefinitions(feedbacks)
}
