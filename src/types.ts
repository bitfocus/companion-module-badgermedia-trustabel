import type { InstanceTypes } from '@companion-module/base'
import type { AdapterMode, LabelColor, LabelStatus, PortState } from './api.js'

/** An adapter port. Users see these as "Panel 1" to "Panel 4". */
export type PortNumber = 1 | 2 | 3 | 4
/** Zero-based index into a label's four lines. */
export type LineIndex = 0 | 1 | 2 | 3
type LineNumber = 1 | 2 | 3 | 4

export type ModuleConfig = {
	host: string
	port: number
}

/** `secret-text` fields are delivered separately from the config, as the instance's secrets. */
export type ModuleSecrets = {
	token?: string
}

type LabelLineOptions = {
	[I in LineIndex as `text${I}`]: string
} & {
	[I in LineIndex as `color${I}`]: LabelColor
}

export type DynamicModeChange = 'toggle' | 'enable' | 'disable'

/** Options shared by everything that addresses one label on one panel; `label` is 1-based. */
type LabelTarget = { panel: PortNumber; label: number }

type NoOptions = Record<string, never>

export type ActionSchemas = {
	flash_label: { options: { panel: PortNumber; labels: string; duration: number } }
	spotlight_label: { options: { panel: PortNumber; labels: string; duration: number } }
	label_set_line: { options: LabelTarget & { line: LineIndex; text: string; color: LabelColor; perm: boolean } }
	label_set_text: { options: LabelTarget & LabelLineOptions & { scale: number; perm: boolean } }
	label_set_image: { options: LabelTarget & { image: string; perm: boolean } }
	label_set_dynamic_enabled: { options: LabelTarget & { dynamic: DynamicModeChange; perm: boolean } }
	label_dynamic: {
		options: LabelTarget & {
			setText: boolean
			dyn_text: string
			setColor: boolean
			dyn_c: LabelColor
			setStatus: boolean
			status: LabelStatus
		}
	}
	label_dynamic_clear: { options: LabelTarget }
	power_cycle: { options: { panel: PortNumber } }
	reboot: { options: NoOptions }
	refresh: { options: NoOptions }
}

export type FeedbackSchemas = {
	label_dynamic_enabled: { type: 'boolean'; options: LabelTarget }
	label_mode: { type: 'boolean'; options: LabelTarget & { mode: 'text' | 'image' } }
	label_status: { type: 'boolean'; options: LabelTarget & { status: LabelStatus } }
	label_line_text: { type: 'boolean'; options: LabelTarget & { line: LineIndex; text: string } }
	panel_state: { type: 'boolean'; options: { panel: PortNumber; state: PortState } }
}

type PanelVariables = { [K in `panel_${PortNumber}_state`]: PortState | '' } & {
	[K in `panel_${PortNumber}_${'device_name' | 'serial_number' | 'firmware'}`]: string
} & { [K in `panel_${PortNumber}_mode`]: 'single' | 'dual' | '' } & {
	[K in `panel_${PortNumber}_orientation`]: 'above' | 'below' | ''
} & { [K in `panel_${PortNumber}_${'screen_count' | 'label_count'}`]: number | undefined }

export type PanelVariableSuffix = keyof PanelVariables extends `panel_${PortNumber}_${infer Suffix}` ? Suffix : never

type LabelTextVariableSuffix =
	| 'text'
	| 'display_text'
	| 'mode'
	| 'image'
	| 'dyn_text'
	| 'dyn_color'
	| 'status'
	| `line${LineNumber}`
	| `line${LineNumber}_color`

type LabelPrefix = `panel_${PortNumber}_label_${number}`

type LabelVariables = { [K in `${LabelPrefix}_${LabelTextVariableSuffix}`]: string } & {
	[K in `${LabelPrefix}_dynamic`]: boolean
} & { [K in `${LabelPrefix}_scale`]: number }

export type ModuleVariables = {
	adapter_model: string
	adapter_firmware: string
	adapter_build: string
	adapter_uptime_s: number | undefined
	adapter_serial_number: string
	adapter_hostname: string
	adapter_mode: AdapterMode | ''
	adapter_ip: string
	adapter_link: 'up' | 'down' | ''
	panel_count: number
} & PanelVariables &
	LabelVariables

export interface ModuleTypes extends InstanceTypes {
	config: ModuleConfig
	secrets: ModuleSecrets
	actions: ActionSchemas
	feedbacks: FeedbackSchemas
	variables: ModuleVariables
}
