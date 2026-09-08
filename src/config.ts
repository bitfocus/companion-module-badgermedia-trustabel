import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export interface ModuleConfig {
	host: string
	port: number
	token: string
	pollInterval: number
	labelCount: number
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info',
			label: 'Information',
			width: 12,
			value: 'Controls a trustabel Network Adapter over its REST API (v1).',
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Network Adapter IP',
			width: 6,
			regex: Regex.HOSTNAME,
			default: '192.168.1.100',
		},
		{
			type: 'number',
			id: 'port',
			label: 'Port',
			width: 6,
			min: 1,
			max: 65535,
			default: 80,
		},
		{
			type: 'secret-text',
			id: 'token',
			label: 'Bearer Token',
			width: 12,
		},
		{
			type: 'number',
			id: 'labelCount',
			label: 'Number of labels to poll',
			tooltip: 'Labels are read from id 0 upwards, and exposed as variables and feedbacks.',
			width: 4,
			min: 0,
			max: 256,
			default: 16,
		},
		{
			type: 'number',
			id: 'pollInterval',
			label: 'Poll interval (seconds)',
			tooltip: 'Set to 0 to disable polling.',
			width: 4,
			min: 0,
			max: 3600,
			default: 5,
		},
	]
}
