import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

const baseConfig = await generateEslintConfig({
	enableTypescript: true,
})

export default [
	...baseConfig,
	{
		// Tests aren't part of the packaged module, so they may import dev dependencies such as vitest.
		files: ['src/**/__tests__/**/*.ts'],
		rules: {
			'n/no-unpublished-import': 'off',
		},
	},
]
