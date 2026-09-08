import type { CompanionStaticUpgradeScript } from '@companion-module/base'
import type { ModuleConfig } from './config.js'

const MAX_SCREEN_DISPLAY_PAIRS = 16

/** Convert the old `pairs` string on Screens - Set Display State into per-screen fields. */
const migrateScreensDisplayPairs: CompanionStaticUpgradeScript<ModuleConfig> = (_context, props) => {
	const updatedActions = []

	for (const action of props.actions) {
		if (action.actionId !== 'screens_display') continue
		const raw = action.options.pairs
		if (typeof raw !== 'string') continue

		const parsed = raw
			.split(',')
			.map((part) => part.trim())
			.filter(Boolean)
			.map((part) => {
				const [sid, state] = part.split(':')
				return { sid: sid?.trim() ?? '', state: state?.trim() === '0' ? '0' : '1' }
			})
			.filter((pair) => pair.sid)
			.slice(0, MAX_SCREEN_DISPLAY_PAIRS)

		action.options.count = Math.max(1, parsed.length)
		for (const [i, pair] of parsed.entries()) {
			action.options[`sid${i}`] = pair.sid
			action.options[`state${i}`] = pair.state
		}
		delete action.options.pairs
		updatedActions.push(action)
	}

	return {
		updatedConfig: null,
		updatedActions,
		updatedFeedbacks: [],
	}
}

/** Fold old pair-rows and Screen - Set On/Off into the two-field display action. */
const migrateScreensDisplayToSharedState: CompanionStaticUpgradeScript<ModuleConfig> = (_context, props) => {
	const updatedActions = []

	for (const action of props.actions) {
		if (action.actionId === 'screen_display_single') {
			action.actionId = 'screens_display'
			updatedActions.push(action)
			continue
		}

		if (action.actionId !== 'screens_display') continue

		const raw = action.options.pairs
		if (typeof raw === 'string') {
			const parsed = raw
				.split(',')
				.map((part) => part.trim())
				.filter(Boolean)
				.map((part) => {
					const [sid, state] = part.split(':')
					return { sid: sid?.trim() ?? '', state: state?.trim() === '0' ? '0' : '1' }
				})
				.filter((pair) => pair.sid)

			action.options.sid = parsed.map((pair) => pair.sid).join(',')
			action.options.state = parsed[0]?.state ?? '1'
			delete action.options.pairs
			updatedActions.push(action)
			continue
		}

		if (action.options.count === undefined && action.options.sid0 === undefined) continue

		const count = Number(action.options.count) || MAX_SCREEN_DISPLAY_PAIRS
		const ids: string[] = []
		let state = '1'
		for (let i = 0; i < count; i++) {
			const sid = typeof action.options[`sid${i}`] === 'string' ? String(action.options[`sid${i}`]).trim() : ''
			if (!sid) continue
			if (ids.length === 0 && action.options[`state${i}`] === '0') state = '0'
			ids.push(sid)
			delete action.options[`sid${i}`]
			delete action.options[`state${i}`]
		}

		action.options.sid = ids.join(',')
		action.options.state = state
		delete action.options.count
		updatedActions.push(action)
	}

	return {
		updatedConfig: null,
		updatedActions,
		updatedFeedbacks: [],
	}
}

export const UpgradeScripts: CompanionStaticUpgradeScript<ModuleConfig>[] = [
	migrateScreensDisplayPairs,
	migrateScreensDisplayToSharedState,
]
