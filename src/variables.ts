import type { CompanionVariableDefinition, CompanionVariableValues } from '@companion-module/base'
import type { ModuleInstance } from './main.js'
import type { LabelObject } from './api.js'

/** Flatten a nested API response into `prefix_key` scalars, which is all a variable can hold. */
export function flattenResponse(
	prefix: string,
	value: unknown,
	out: Record<string, string> = {},
): Record<string, string> {
	if (typeof value === 'string') {
		out[prefix] = value
	} else if (typeof value === 'number' || typeof value === 'boolean') {
		out[prefix] = String(value)
	} else if (Array.isArray(value)) {
		out[prefix] = value.join(',')
	} else if (value !== null && typeof value === 'object') {
		for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
			flattenResponse(prefix ? `${prefix}_${sanitise(key)}` : sanitise(key), child, out)
		}
	} else {
		out[prefix] = ''
	}
	return out
}

function sanitise(key: string): string {
	return key.replace(/[^a-zA-Z0-9_]/g, '_')
}

export function labelVariableValues(label: LabelObject): CompanionVariableValues {
	const id = label.id
	const values: CompanionVariableValues = {
		[`label_${id}_mode`]: label.mode ?? '',
		[`label_${id}_scale`]: String(label.scale ?? ''),
		[`label_${id}_image`]: label.image ?? '',
		[`label_${id}_dynamic`]: label.dynamic ? 'true' : 'false',
		[`label_${id}_dyn_text`]: label.dyn_text ?? '',
		[`label_${id}_dyn_color`]: label.dyn_c ?? '',
		[`label_${id}_status`]: label.status ?? '',
	}
	for (let i = 0; i < 4; i++) {
		values[`label_${id}_line${i + 1}`] = label.lines?.[i]?.t ?? ''
		values[`label_${id}_line${i + 1}_color`] = label.lines?.[i]?.c ?? ''
	}
	return values
}

function labelVariableDefinitions(id: number): CompanionVariableDefinition[] {
	const defs: CompanionVariableDefinition[] = [
		{ variableId: `label_${id}_mode`, name: `Label ${id}: mode` },
		{ variableId: `label_${id}_scale`, name: `Label ${id}: scale` },
		{ variableId: `label_${id}_image`, name: `Label ${id}: image` },
		{ variableId: `label_${id}_dynamic`, name: `Label ${id}: dynamic mode enabled` },
		{ variableId: `label_${id}_dyn_text`, name: `Label ${id}: dynamic text` },
		{ variableId: `label_${id}_dyn_color`, name: `Label ${id}: dynamic colour` },
		{ variableId: `label_${id}_status`, name: `Label ${id}: status` },
	]
	for (let i = 1; i <= 4; i++) {
		defs.push({ variableId: `label_${id}_line${i}`, name: `Label ${id}: line ${i} text` })
		defs.push({ variableId: `label_${id}_line${i}_color`, name: `Label ${id}: line ${i} colour` })
	}
	return defs
}

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	const definitions: CompanionVariableDefinition[] = []

	// The API describes /health and /info as free-form objects, so expose whatever keys came back.
	for (const key of [...self.dynamicVariableIds].sort()) {
		definitions.push({ variableId: key, name: key.replace(/_/g, ' ') })
	}

	for (let id = 0; id < self.labelCount; id++) {
		definitions.push(...labelVariableDefinitions(id))
	}

	self.setVariableDefinitions(definitions)
}
