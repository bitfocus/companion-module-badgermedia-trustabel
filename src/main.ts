import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields } from './config.js'
import {
	UpdateVariableDefinitions,
	healthVariableValues,
	labelVariableValues,
	panelVariableValues,
	systemInfoVariableValues,
} from './variables.js'
import type { ModuleConfig, ModuleSecrets, ModuleTypes, ModuleVariables, PortNumber } from './types.js'
import { UpdateActions } from './actions.js'
import { UpdateFeedbacks } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import { PANEL_NUMBERS } from './options.js'
import {
	NoPanelError,
	NotConfiguredError,
	TrustabelApiError,
	TrustabelNetworkError,
	errorMessage,
	isConnectionError,
	statusForError,
	technicalDetail,
} from './errors.js'
import {
	TrustabelApi,
	findPanelOnPort,
	toLabelNumber,
	type Label,
	type LabelId,
	type PanelDetails,
	type PortInfo,
	type PortState,
	type SystemInfoResponse,
} from './api.js'

/** Adapter health and port states are cheap for the adapter to answer, so they are checked often. */
const POLL_INTERVAL_MS = 5000
/** Reading labels goes through to each panel, so it is done less often (and right after a command). */
const LABEL_POLL_INTERVAL_MS = 15000

/**
 * Polls in a row that may fail to reach the adapter before the status changes. Each request is
 * already retried, so this only rides out brief network drops (e.g. over a VPN), about 15 seconds.
 */
const TOLERATED_POLL_FAILURES = 2

/** How long after a Reboot the adapter being unreachable is expected rather than a fault. */
const REBOOT_GRACE_MS = 60000

export { UpgradeScripts } from './upgrades.js'

/** An active panel on one adapter port, and its latest label state keyed by label id. */
export interface PanelState {
	details: PanelDetails
	labels: Map<LabelId, Label>
}

type Variables = Partial<ModuleVariables>

export default class ModuleInstance extends InstanceBase<ModuleTypes> {
	config!: ModuleConfig // Setup in init()
	secrets: ModuleSecrets = {}

	/** Active panels, keyed by the adapter port they are on. */
	readonly panels = new Map<PortNumber, PanelState>()
	/** Latest port details from `/health` and `/info`, used for panel names and states. */
	readonly ports = new Map<PortNumber, PortInfo>()
	connected = false

	/** Null while no adapter address is configured. */
	#api: TrustabelApi | null = null
	#pollTimer: NodeJS.Timeout | undefined
	#refreshTimer: NodeJS.Timeout | undefined
	/** When every panel's labels were last read. */
	#labelsReadAt = 0
	/** A full refresh was asked for; the next poll reads all labels, and runs again if one was in flight. */
	#refreshPending = false
	/** Until when failing to reach the adapter is expected, because it was told to reboot. */
	#restartingUntil = 0
	/** Polls in a row that couldn't reach the adapter. */
	#failedPolls = 0
	/** The last error per panel, so a panel that keeps failing is only reported once. */
	readonly #panelErrors = new Map<PortNumber, string>()
	/** What the definitions were last built for, so they are only rebuilt when the panels change. */
	#definedFor = ''
	/** Bumped on every config change, so a poll still in flight for the old config drops its results. */
	#generation = 0
	/** Generation of the poll currently running, if any. */
	#pollingGeneration: number | null = null

	constructor(internal: unknown) {
		super(internal)
	}

	get api(): TrustabelApi {
		if (!this.#api) throw new NotConfiguredError('No network adapter IP configured')
		return this.#api
	}

	get #token(): string {
		return (this.secrets.token ?? '').trim()
	}

	labelCount(panel: PortNumber): number {
		return this.panels.get(panel)?.details.labelTotal ?? 0
	}

	portState(panel: PortNumber): PortState | undefined {
		return this.ports.get(panel)?.state
	}

	requirePanel(panel: PortNumber): PanelState {
		const state = this.panels.get(panel)
		if (!state) throw new NoPanelError(`Panel ${panel} is not active`)
		return state
	}

	async init(config: ModuleConfig, _isFirstInit: boolean, secrets: ModuleSecrets): Promise<void> {
		this.#applyConfig(config, secrets)
	}

	async destroy(): Promise<void> {
		this.#generation++
		this.#stopPolling()
	}

	async configUpdated(config: ModuleConfig, secrets: ModuleSecrets): Promise<void> {
		this.#applyConfig(config, secrets)
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

	/** Report a failure that means the adapter can't be used, and reflect it in the status. */
	handleApiError(err: unknown): void {
		const message = errorMessage(err)
		// Only log at error when a session drops. Retrying while already disconnected
		// would fill the log every poll interval (e.g. timeouts with no adapter online).
		this.log(this.connected ? 'error' : 'debug', message)
		this.log('debug', technicalDetail(err))
		this.#setStatus(statusForError(err), message)
	}

	/**
	 * An action failed. Only a rejected token changes the status straight away; whether the adapter is
	 * reachable is left to polling, which rides out brief drops.
	 */
	reportActionError(err: unknown): void {
		if (isAdapterError(err) && !(err instanceof TrustabelNetworkError)) {
			this.handleApiError(err)
		} else {
			this.log('warn', errorMessage(err))
			this.log('debug', technicalDetail(err))
		}
	}

	/**
	 * A poll couldn't reach the adapter. Brief drops are only logged; the status changes once they
	 * last for several polls in a row, or straight away if the connection was never up.
	 */
	#handlePollFailure(err: unknown): void {
		this.#failedPolls++
		if (err instanceof TrustabelNetworkError && Date.now() < this.#restartingUntil) {
			this.log('debug', `Adapter is restarting: ${technicalDetail(err)}`)
			this.connected = false
			this.updateStatus(InstanceStatus.Connecting, 'The adapter is restarting')
			return
		}
		if (err instanceof TrustabelNetworkError && this.connected && this.#failedPolls <= TOLERATED_POLL_FAILURES) {
			this.log('debug', `Poll ${this.#failedPolls} of ${TOLERATED_POLL_FAILURES + 1} failed: ${technicalDetail(err)}`)
			return
		}
		this.handleApiError(err)
	}

	/** Re-read a single label after a change so variables and feedbacks stay in step. */
	async refreshLabel(panel: PortNumber, id: LabelId): Promise<void> {
		const state = this.panels.get(panel)
		if (!state) return
		try {
			this.#storeLabels(panel, state, [await this.api.labelGet(state.details.serial, id)])
			this.checkAllFeedbacks()
		} catch (err) {
			this.log('debug', `Failed to refresh panel ${panel} label ${toLabelNumber(id)}: ${technicalDetail(err)}`)
		}
	}

	/** Read everything now, including every panel's labels. */
	async refresh(): Promise<void> {
		this.#refreshPending = true
		await this.#poll()
	}

	/** Refresh once `delayMs` has passed, e.g. after a command that takes the panel or adapter away for a while. */
	scheduleRefresh(delayMs: number): void {
		clearTimeout(this.#refreshTimer)
		this.#refreshTimer = setTimeout(() => void this.refresh(), delayMs)
	}

	/** The adapter was told to reboot: report it as restarting rather than failing, and refresh once it is back. */
	expectRestart(refreshAfterMs: number): void {
		this.#restartingUntil = Date.now() + REBOOT_GRACE_MS
		this.scheduleRefresh(refreshAfterMs)
	}

	/** Read adapter health and info and find the active panels; read their labels when that is due. */
	async #poll(): Promise<void> {
		const generation = this.#generation
		if (this.#pollingGeneration === generation) return
		this.#pollingGeneration = generation
		const isStale = () => generation !== this.#generation
		const startedAt = Date.now()
		const readLabels = this.#refreshPending || startedAt - this.#labelsReadAt >= LABEL_POLL_INTERVAL_MS
		this.#refreshPending = false
		try {
			const values: Variables = {}

			const health = await this.api.health()
			if (isStale()) return
			Object.assign(values, healthVariableValues(health))
			for (const port of health.ports) this.ports.set(port.port, { ...this.ports.get(port.port), ...port })

			if (!this.#token) {
				this.#clearPanels(values)
				this.#publish(values)
				this.#setStatus(InstanceStatus.BadConfig, 'No bearer token configured; only adapter health is available')
				return
			}

			const info = await this.api.info()
			if (isStale()) return
			Object.assign(values, systemInfoVariableValues(info))
			this.ports.clear()
			for (const port of info.ports) this.ports.set(port.port, port)

			if (info.adapter.mode === 'protocol') {
				this.#clearPanels(values)
				this.#publish(values)
				this.#setStatus(
					InstanceStatus.BadConfig,
					'Adapter is in protocol mode; panel control is only available in server mode',
				)
				return
			}

			for (const panel of PANEL_NUMBERS) {
				// Panels share the adapter, so they are read one after another rather than all at once.
				await this.#pollPanel(panel, info, readLabels, values, isStale)
				if (isStale()) return
			}
			if (readLabels) this.#labelsReadAt = startedAt

			values.panel_count = this.panels.size
			this.#updateDefinitions()
			this.#publish(values)
			this.#restartingUntil = 0
			if (this.panels.size === 0) {
				this.#setStatus(InstanceStatus.UnknownWarning, 'No active panels on the adapter')
			} else {
				this.#setStatus(InstanceStatus.Ok)
			}
		} catch (err) {
			if (!isStale()) this.#handlePollFailure(err)
		} finally {
			if (this.#pollingGeneration === generation) {
				this.#pollingGeneration = null
				// A refresh asked for while this poll was running would otherwise be lost.
				if (this.#refreshPending) void this.#poll()
			}
		}
	}

	/** Bring one panel up to date; a failure here only affects that panel. */
	async #pollPanel(
		panel: PortNumber,
		info: SystemInfoResponse,
		readLabels: boolean,
		values: Variables,
		isStale: () => boolean,
	): Promise<void> {
		const serial = findPanelOnPort(info, panel)
		if (!serial) {
			this.#removePanel(panel, values)
			this.#panelErrors.delete(panel)
			return
		}

		try {
			let state = this.panels.get(panel)
			if (state?.details.serial !== serial) {
				this.#removePanel(panel, values)
				// A panel that failed to answer is only retried at the label cadence, not every poll.
				if (this.#panelErrors.has(panel) && !readLabels) return
				// `/panel/{serial}/info` is a live query to the panel, so it is only read when the panel changes.
				const { details, labels } = await this.api.describePanel(serial, panel)
				if (isStale()) return
				state = { details, labels: new Map() }
				this.panels.set(panel, state)
				this.#storeLabels(panel, state, labels)
			} else if (readLabels) {
				const labels = await this.api.labelsGetAll(state.details.serial, state.details.labelTotal)
				if (isStale()) return
				this.#storeLabels(panel, state, labels)
			}
			Object.assign(values, panelVariableValues(panel, state.details))
			if (this.#panelErrors.delete(panel)) this.log('info', `Panel ${panel} is responding again`)
		} catch (err) {
			if (isAdapterError(err)) throw err
			const message = `Panel ${panel}: ${errorMessage(err)}`
			if (!this.#panelErrors.has(panel)) this.log('warn', message)
			this.log('debug', `Panel ${panel}: ${technicalDetail(err)}`)
			this.#panelErrors.set(panel, message)
		}
	}

	#removePanel(panel: PortNumber, values: Variables): void {
		this.panels.delete(panel)
		Object.assign(values, panelVariableValues(panel, null))
	}

	#clearPanels(values: Variables): void {
		for (const panel of PANEL_NUMBERS) this.#removePanel(panel, values)
		values.panel_count = 0
		this.#updateDefinitions()
	}

	/** Rebuild definitions when the panels, their label counts or their names change. */
	#updateDefinitions(): void {
		const signature = JSON.stringify(
			PANEL_NUMBERS.map((panel) => [
				this.panels.get(panel)?.details.labelTotal ?? null,
				this.ports.get(panel)?.device_name ?? null,
				this.ports.get(panel)?.state ?? null,
			]),
		)
		if (signature === this.#definedFor) return
		this.#definedFor = signature
		this.updateActions()
		this.updateFeedbacks()
		this.updateVariableDefinitions()
		this.updatePresets()
	}

	#setStatus(status: InstanceStatus, message?: string): void {
		const connected = status === InstanceStatus.Ok || status === InstanceStatus.UnknownWarning
		if (connected) {
			if (this.#failedPolls > TOLERATED_POLL_FAILURES) this.log('info', 'Connection to the adapter restored')
			this.#failedPolls = 0
		}
		this.connected = connected
		this.updateStatus(status, message)
	}

	#publish(values: Variables): void {
		this.setVariableValues(values)
		this.checkAllFeedbacks()
	}

	#storeLabels(panel: PortNumber, state: PanelState, labels: Label[]): void {
		const values: Variables = {}
		for (const label of labels) {
			state.labels.set(label.id, label)
			Object.assign(values, labelVariableValues(panel, label))
		}
		this.setVariableValues(values)
	}

	/** Sets up for the new config and starts polling in the background, so init returns at once. */
	#applyConfig(config: ModuleConfig, secrets: ModuleSecrets | undefined): void {
		this.config = config
		this.secrets = secrets ?? {}
		this.#generation++
		this.#stopPolling()
		this.panels.clear()
		this.ports.clear()
		this.#panelErrors.clear()
		this.#definedFor = ''
		this.#failedPolls = 0
		this.#labelsReadAt = 0
		this.connected = false

		this.#refreshPending = false
		this.#restartingUntil = 0
		this.#api = this.config.host ? new TrustabelApi(this.config, this.#token) : null
		this.#updateDefinitions()

		if (!this.#api) {
			this.updateStatus(InstanceStatus.BadConfig, 'No network adapter IP configured')
			return
		}
		this.updateStatus(InstanceStatus.Connecting)

		void this.#poll()
		this.#pollTimer = setInterval(() => void this.#poll(), POLL_INTERVAL_MS)
	}

	#stopPolling(): void {
		clearTimeout(this.#refreshTimer)
		this.#refreshTimer = undefined
		if (this.#pollTimer) {
			clearInterval(this.#pollTimer)
			this.#pollTimer = undefined
		}
	}
}

/**
 * Whether a failure means the adapter itself can't be used (unreachable, or the token is rejected),
 * as opposed to one panel or one request having a problem.
 */
function isAdapterError(err: unknown): boolean {
	if (!isConnectionError(err)) return false
	return !(err instanceof TrustabelApiError) || err.statusCode !== 503
}
