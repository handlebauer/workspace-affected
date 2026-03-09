import { defineConfig } from 'tsdown'

export default defineConfig({
	clean: true,
	dts: true,
	entry: {
		cli: 'src/cli.ts',
		index: 'src/index.ts',
	},
	format: 'esm',
	outDir: 'dist',
	platform: 'node',
})
