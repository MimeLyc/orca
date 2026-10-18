import {
  canonicalizeParsedKeybinding,
  getKeybindingConflictIdentity,
  parseKeybinding,
  type KeybindingFileDiagnostic
} from './keybindings'

export const TERMINAL_COPY_MODE_ACTIONS = [
  'left',
  'down',
  'up',
  'right',
  'toggleSelection',
  'copy',
  'exit'
] as const

export type TerminalCopyModeAction = (typeof TERMINAL_COPY_MODE_ACTIONS)[number]
export type TerminalCopyModeConfig = {
  exitOnCopy: boolean
  bindings: Record<TerminalCopyModeAction, readonly string[]>
}

export const DEFAULT_TERMINAL_COPY_MODE_CONFIG: TerminalCopyModeConfig = {
  exitOnCopy: true,
  bindings: {
    left: ['H', 'ArrowLeft'],
    down: ['J', 'ArrowDown'],
    up: ['K', 'ArrowUp'],
    right: ['L', 'ArrowRight'],
    toggleSelection: ['V'],
    copy: ['Y'],
    exit: ['Escape', 'Q']
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeBindings(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const result: string[] = []
  for (const binding of value) {
    if (typeof binding !== 'string') {
      return null
    }
    const parsed = parseKeybinding(binding)
    if (!parsed || parsed.doubleTapModifier || (parsed.mod && (parsed.meta || parsed.control))) {
      return null
    }
    const canonical = canonicalizeParsedKeybinding(parsed)
    if (!result.includes(canonical)) {
      result.push(canonical)
    }
  }
  return result
}

export function normalizeTerminalCopyModeConfig(
  value: unknown,
  platform: NodeJS.Platform,
  diagnostics: KeybindingFileDiagnostic[] = []
): TerminalCopyModeConfig {
  const defaults = DEFAULT_TERMINAL_COPY_MODE_CONFIG
  const config = { exitOnCopy: defaults.exitOnCopy, bindings: { ...defaults.bindings } }
  const report = (section: string, message: string, severity: 'error' | 'warning' = 'error') => {
    diagnostics.push({ section, message, severity })
  }
  if (value === undefined) {
    return config
  }
  if (!isObject(value)) {
    report('copyMode', 'copyMode must be an object. Defaults are active.')
    return config
  }
  for (const field of Object.keys(value)) {
    if (field !== 'exitOnCopy' && field !== 'bindings') {
      report(`copyMode.${field}`, `Unknown copy-mode field "${field}" was ignored.`, 'warning')
    }
  }
  if (value.exitOnCopy !== undefined) {
    if (typeof value.exitOnCopy === 'boolean') {
      config.exitOnCopy = value.exitOnCopy
    } else {
      report('copyMode.exitOnCopy', 'copyMode.exitOnCopy must be a boolean.')
    }
  }
  if (value.bindings === undefined) {
    return config
  }
  if (!isObject(value.bindings)) {
    report('copyMode.bindings', 'copyMode.bindings must be an object. Default bindings are active.')
    return config
  }
  const actions = new Set<string>(TERMINAL_COPY_MODE_ACTIONS)
  for (const field of Object.keys(value.bindings)) {
    if (!actions.has(field)) {
      report(
        `copyMode.bindings.${field}`,
        `Unknown copy-mode action "${field}" was ignored.`,
        'warning'
      )
    }
  }
  for (const action of TERMINAL_COPY_MODE_ACTIONS) {
    const raw = value.bindings[action]
    if (raw === undefined) {
      continue
    }
    const normalized = normalizeBindings(raw)
    if (!normalized || (action === 'exit' && normalized.length === 0)) {
      report(
        `copyMode.bindings.${action}`,
        `Invalid bindings for "${action}". Use an array of single shortcuts; exit needs at least one binding.`
      )
      continue
    }
    config.bindings[action] = normalized
  }
  const owners = new Map<string, TerminalCopyModeAction>()
  for (const action of TERMINAL_COPY_MODE_ACTIONS) {
    for (const binding of config.bindings[action]) {
      const identity = getKeybindingConflictIdentity(binding, platform)
      const previous = owners.get(identity)
      if (previous && previous !== action) {
        report(
          'copyMode.bindings',
          `Copy-mode binding "${binding}" conflicts between "${previous}" and "${action}". Default bindings are active.`
        )
        config.bindings = { ...defaults.bindings }
        return config
      }
      owners.set(identity, action)
    }
  }
  return config
}
