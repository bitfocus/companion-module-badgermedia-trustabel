import {
	InstanceBase,
	runEntrypoint,
	InstanceStatus,
	type CompanionVariableValues,
	type SomeCompanionConfigField,
} from '@companion-module/base'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { UpdateVariableDefinitions, flattenResponse, labelVariableValues } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions } from './actions.js'
import { UpdateFeedbacks } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import { TrustabelApi, statusForError, type LabelObject } from './api.js'

/** Labels are fetched in batches of this many by `/api/v1/labels_get`. */
const LABEL_BATCH_SIZE = 8

export class ModuleInstance extends InstanceBase<ModuleConfig> {
	config!: ModuleConfig // Setup in init()
	api!: TrustabelApi

	/** Latest known label state, keyed by label id. */
	readonly labels = new Map<number, LabelObject>()
	/** Variable ids discovered from the free-form /health and /info responses. */
	readonly dynamicVariableIds = new Set<string>()
	connected = false

	#pollTimer: NodeJS.Timeout | undefined
	#polling = false

	constructor(internal: unknown) {
		super(internal)
	}

	get labelCount(): number {
		return Math.max(0, Number(this.config?.labelCount ?? 0))
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config
		await this.#applyConfig()
	}

	async destroy(): Promise<void> {
		this.#stopPolling()
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		await this.#applyConfig()
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updatePresets(): void {
		UpdatePresets(this)
	}

	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}

	/** Report an API failure to the user and reflect it in the instance status. */
	handleApiError(err: unknown): void {
		const message = err instanceof Error ? err.message : String(err)
		// Only log at error when a session drops. Retrying while already disconnected
		// would fill the log every poll interval (e.g. timeouts with no panel online).
		if (this.connected) {
			this.log('error', message)
		} else {
			this.log('debug', message)
		}
		this.connected = false
		this.updateStatus(statusForError(err), message)
	}

	/** Re-read a single label after a change so variables and feedbacks stay in step. */
	async refreshLabel(id: number): Promise<void> {
		try {
			const label = await this.api.labelGet(id)
			this.#storeLabel(id, label)
			this.checkFeedbacks('label_dynamic_enabled', 'label_mode', 'label_status', 'label_line_text')
		} catch (err) {
			this.log('debug', `Failed to refresh label ${id}: ${err instanceof Error ? err.message : String(err)}`)
		}
	}

	/** Read health, info and all configured labels, and publish them as variables. */
	async poll(): Promise<void> {
		if (this.#polling) return
		this.#polling = true
		try {
			const values: CompanionVariableValues = {}
			const discovered = new Set<string>()

			const health = await this.api.health()
			for (const [key, value] of Object.entries(flattenResponse('health', health))) {
				discovered.add(key)
				values[key] = value
			}

			if (this.config.token) {
				const info = await this.api.info()
				for (const [key, value] of Object.entries(flattenResponse('info', info))) {
					discovered.add(key)
					values[key] = value
				}

				await this.#pollLabels(values)
			}

			// The variable definitions depend on which keys the panel actually returned.
			if (!setsAreEqual(discovered, this.dynamicVariableIds)) {
				this.dynamicVariableIds.clear()
				for (const key of discovered) this.dynamicVariableIds.add(key)
				this.updateVariableDefinitions()
			}

			this.setVariableValues(values)
			this.connected = true
			this.updateStatus(InstanceStatus.Ok)
			this.checkFeedbacks('label_dynamic_enabled', 'label_mode', 'label_status', 'label_line_text')
		} catch (err) {
			this.handleApiError(err)
		} finally {
			this.#polling = false
		}
	}

	async #pollLabels(values: CompanionVariableValues): Promise<void> {
		for (let start = 0; start < this.labelCount; start += LABEL_BATCH_SIZE) {
			const count = Math.min(LABEL_BATCH_SIZE, this.labelCount - start)
			const response = await this.api.labelsGet(start, count)
			for (const label of response.labels ?? []) {
				this.#storeLabel(label.id, label)
				Object.assign(values, labelVariableValues(label))
			}
		}
	}

	#storeLabel(id: number, label: LabelObject): void {
		const stored: LabelObject = { ...label, id: label.id ?? id }
		this.labels.set(stored.id, stored)
		this.setVariableValues(labelVariableValues(stored))
	}

	async #applyConfig(): Promise<void> {
		this.#stopPolling()
		this.labels.clear()

		if (!this.config.host) {
			this.updateStatus(InstanceStatus.BadConfig, 'No network adapter IP configured')
			return
		}

		this.api = new TrustabelApi(this.config)
		this.connected = false
		this.updateStatus(InstanceStatus.Connecting)

		this.updateActions()
		this.updateFeedbacks()
		this.updatePresets()
		this.updateVariableDefinitions()

		await this.poll()
		this.#startPolling()
	}

	#startPolling(): void {
		this.#stopPolling()
		const interval = Number(this.config.pollInterval ?? 0)
		if (interval <= 0) return
		this.#pollTimer = setInterval(() => void this.poll(), interval * 1000)
	}

	#stopPolling(): void {
		if (this.#pollTimer) {
			clearInterval(this.#pollTimer)
			this.#pollTimer = undefined
		}
	}
}

function setsAreEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
	if (a.size !== b.size) return false
	for (const value of a) if (!b.has(value)) return false
	return true
}

runEntrypoint(ModuleInstance, UpgradeScripts)
