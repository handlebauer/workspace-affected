export type RunStepOptions = Readonly<{
	replace?: boolean
}>

export interface SourceFileOptions {
	directory?: string
	exclude?: (filePath: string) => boolean
}

export type TaskStatus = 'pending' | 'running' | 'success' | 'error' | 'cancelled'
