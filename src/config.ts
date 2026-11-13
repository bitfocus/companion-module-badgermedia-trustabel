import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export type { ModuleConfig, ModuleSecrets } from './types.js'

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info',
			label: 'Information',
			width: 12,
			value:
				'Control the Trustabel T-NA4 Network Adapter and the panels connected to it. The adapter must be in **server mode**.',
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Network Adapter IP',
			width: 6,
			regex: Regex.HOSTNAME,
			default: '192.168.1.99',
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
	]
}
