import { isAbsolute, resolve } from 'node:path'

import type { TaskDef, TaskRunnerConfig, TaskStep } from './types.ts'

const DEFAULT_CONFIG_FILE = '.hness.json'
const EMPTY = 0
const MIN_TIMEOUT_MS = 1

/**
 * Type guard for plain objects (non-null, non-array).
 *
 * @param value - Value to check
 * @returns True if value is a record-like object
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

/**
 * Parse an optional string field from a task definition.
 *
 * @param value - Raw value from config
 * @param fieldName - Field name for error messages
 * @param taskId - Task ID for error messages
 * @returns Trimmed string or undefined if not present
 * @throws Error if value is present but not a non-empty string
 */
function parseOptionalString(
	value: unknown,
	fieldName: string,
	taskId: string,
): string | undefined {
	if (value === undefined) {
		return undefined
	}

	if (typeof value !== 'string' || value.trim().length === EMPTY) {
		throw new Error(`task "${taskId}" has invalid "${fieldName}"`)
	}

	return value
}

/**
 * Parse an optional boolean field from a task definition.
 *
 * @param value - Raw value from config
 * @param fieldName - Field name for error messages
 * @param taskId - Task ID for error messages
 * @returns Boolean or undefined if not present
 * @throws Error if value is present but not a boolean
 */
function parseOptionalBoolean(
	value: unknown,
	fieldName: string,
	taskId: string,
): boolean | undefined {
	if (value === undefined) {
		return undefined
	}

	if (typeof value !== 'boolean') {
		throw new Error(`task "${taskId}" has invalid "${fieldName}" (expected boolean)`)
	}

	return value
}

/**
 * Parse optional timeout in milliseconds from a task definition.
 *
 * @param value - Raw value from config
 * @param taskId - Task ID for error messages
 * @returns Integer >= 1, or undefined if not present
 * @throws Error if value is present but not a valid timeout
 */
function parseOptionalTimeout(value: unknown, taskId: string): number | undefined {
	if (value === undefined) {
		return undefined
	}

	if (typeof value !== 'number' || !Number.isInteger(value) || value < MIN_TIMEOUT_MS) {
		throw new Error(`task "${taskId}" has invalid "timeoutMs" (expected integer >= 1)`)
	}

	return value
}

/**
 * Parse a single task definition from the config tasks array.
 *
 * @param value - Raw task object
 * @param index - Index in the tasks array (for error messages)
 * @returns Validated TaskDef
 * @throws Error if structure is invalid or required fields are missing
 */
function parseTaskDef(value: unknown, index: number): TaskDef {
	if (!isRecord(value)) {
		throw new Error(`task at index ${index} must be an object`)
	}

	const id = value.id

	if (typeof id !== 'string' || id.trim().length === EMPTY) {
		throw new Error(`task at index ${index} must include a non-empty "id"`)
	}

	const command = value.command

	if (typeof command !== 'string' || command.trim().length === EMPTY) {
		throw new Error(`task "${id}" has invalid "command"`)
	}

	const name = parseOptionalString(value.name, 'name', id)
	const allowFailure = parseOptionalBoolean(value.allowFailure, 'allowFailure', id)
	const timeoutMs = parseOptionalTimeout(value.timeoutMs, id)

	return { allowFailure, command, id, name, timeoutMs }
}

/**
 * Parse a single task step which can be a task object or a parallel group.
 *
 * Arrays within the tasks list represent parallel groups.
 *
 * @param value - Raw task step (object or array)
 * @param index - Index in the tasks array (for error messages)
 * @returns Validated TaskStep
 * @throws Error if structure is invalid
 */
function parseTaskStep(value: unknown, index: number): TaskStep {
	if (Array.isArray(value)) {
		if (value.length === 0) {
			throw new Error(`parallel group at index ${index} must not be empty`)
		}

		return value.map((item, subIndex) => parseTaskDef(item, subIndex))
	}

	return parseTaskDef(value, index)
}

/**
 * Parse and validate the full task-runner config object.
 *
 * @param value - Parsed JSON object
 * @returns Validated TaskRunnerConfig
 * @throws Error if structure is invalid
 */
function parseConfig(value: unknown): TaskRunnerConfig {
	if (!isRecord(value)) {
		throw new Error('config must be an object')
	}

	const rawTasks = value.tasks

	if (!Array.isArray(rawTasks)) {
		throw new Error('config must include a "tasks" array')
	}

	const tasks: TaskStep[] = rawTasks.map(parseTaskStep)

	return { tasks }
}

/**
 * Resolve the config file path to an absolute path.
 *
 * @param configPath - Optional user-provided path (defaults to .hness.json)
 * @param cwd - Current working directory for relative paths
 * @returns Absolute path to the config file
 */
export function resolveConfigPath(configPath?: string, cwd = process.cwd()): string {
	const targetPath = configPath ?? DEFAULT_CONFIG_FILE

	if (isAbsolute(targetPath)) {
		return targetPath
	}

	return resolve(cwd, targetPath)
}

/**
 * Load and parse the task-runner config from disk.
 *
 * @param configPath - Optional path to config file (defaults to .hness.json)
 * @param cwd - Current working directory for path resolution
 * @returns Parsed and validated TaskRunnerConfig
 * @throws Error if file cannot be read or JSON is invalid
 */
export async function loadConfig(
	configPath?: string,
	cwd = process.cwd(),
): Promise<TaskRunnerConfig> {
	const resolvedPath = resolveConfigPath(configPath, cwd)
	let rawText = ''

	try {
		rawText = await Bun.file(resolvedPath).text()
	} catch {
		throw new Error(`unable to read task config at "${resolvedPath}"`)
	}

	let parsed: unknown = undefined

	try {
		parsed = JSON.parse(rawText) as unknown
	} catch {
		throw new Error(`invalid JSON in task config "${resolvedPath}"`)
	}

	return parseConfig(parsed)
}
