import { createRoot } from 'react-dom/client'
import { toast } from 'sonner'
import type { ManagedPane } from '@/lib/pane-manager/pane-manager'
import { translate } from '@/i18n/i18n'
import { keybindingMatchesInput } from '../../../../shared/keybindings'
import {
  TERMINAL_COPY_MODE_ACTIONS,
  type TerminalCopyModeConfig
} from '../../../../shared/terminal-copy-mode-config'
import { copyTerminalSelection } from './terminal-selection-copy'
import { createTerminalCopyModeSnapshot } from './terminal-copy-mode-snapshot'
import {
  createCopyModeSelection,
  moveCopyModeCursor,
  renderCopyModeSelection,
  type CopyModeSelection
} from './terminal-copy-mode-selection'
import { TerminalCopyModeStatus } from './TerminalCopyModeStatus'

export function createTerminalCopyModeView(
  pane: ManagedPane,
  config: TerminalCopyModeConfig,
  platform: NodeJS.Platform,
  onExit: () => void,
  canFocus: () => boolean
) {
  const snapshot = createTerminalCopyModeSnapshot(pane)
  const { terminal, root, cursor, screen, viewport } = snapshot
  root.setAttribute('role', 'region')
  root.setAttribute('aria-label', translate('terminal.copyMode.active', 'Copy mode'))
  const status = createRoot(snapshot.status)
  let state: CopyModeSelection | null = null
  let disposed = false
  let copying = false
  const renderStatus = (): void => {
    status.render(
      <TerminalCopyModeStatus
        config={config}
        platform={platform}
        selecting={state?.anchor != null}
      />
    )
  }
  const renderCursor = (reveal = false): void => {
    if (!state || !screen) {
      return
    }
    const { row, column } = state.cursor
    const visibleRow = row - terminal.buffer.active.viewportY
    cursor.hidden = visibleRow < 0 || visibleRow >= terminal.rows
    const width = Math.max(1, terminal.buffer.active.getLine(row)?.getCell(column)?.getWidth() ?? 1)
    const cellWidth = screen.clientWidth / terminal.cols
    const cellHeight = screen.clientHeight / terminal.rows
    cursor.style.left = `${column * cellWidth}px`
    cursor.style.top = `${visibleRow * cellHeight}px`
    cursor.style.width = `${cellWidth * width}px`
    cursor.style.height = `${cellHeight}px`
    if (reveal && !cursor.hidden) {
      const rect = cursor.getBoundingClientRect()
      const bounds = viewport.getBoundingClientRect()
      if (rect.left < bounds.left) {
        viewport.scrollLeft -= bounds.left - rect.left
      } else if (rect.right > bounds.right) {
        viewport.scrollLeft += rect.right - bounds.right
      }
      if (rect.top < bounds.top) {
        viewport.scrollTop -= bounds.top - rect.top
      } else if (rect.bottom > bounds.bottom) {
        viewport.scrollTop += rect.bottom - bounds.bottom
      }
    }
  }
  const render = (): void => {
    if (!state) {
      return
    }
    const row = state.cursor.row
    if (row < terminal.buffer.active.viewportY) {
      terminal.scrollToLine(row)
    } else if (row >= terminal.buffer.active.viewportY + terminal.rows) {
      terminal.scrollToLine(row - terminal.rows + 1)
    }
    renderCopyModeSelection(terminal, state)
    renderCursor(true)
  }
  const copy = async (): Promise<void> => {
    if (!state?.anchor || copying || disposed) {
      return
    }
    copying = true
    try {
      const copied = await copyTerminalSelection({
        terminal,
        writeClipboardText: window.api.ui.writeTerminalClipboardText
      })
      if (!disposed && copied && config.exitOnCopy) {
        onExit()
      }
    } catch {
      if (!disposed) {
        toast.error(
          translate('terminal.copyMode.copyFailed', 'Could not copy terminal selection. Try again.')
        )
      }
    } finally {
      copying = false
    }
  }
  renderStatus()
  const scroll = terminal.onScroll(() => renderCursor())
  const resize = new ResizeObserver(() => renderCursor(true))
  resize.observe(viewport)
  void snapshot.ready.then(() => {
    if (disposed) {
      return
    }
    state = createCopyModeSelection(terminal, snapshot.position)
    render()
    if (canFocus()) {
      terminal.focus()
    }
  })
  return {
    contains: (target: EventTarget | null) => target instanceof Node && root.contains(target),
    focus: () => terminal.focus(),
    handleKeyDown(event: KeyboardEvent): boolean {
      const action = TERMINAL_COPY_MODE_ACTIONS.find((candidate) =>
        config.bindings[candidate].some((binding) =>
          keybindingMatchesInput(binding, event, platform)
        )
      )
      if (!action) {
        return false
      }
      if (action === 'exit') {
        if (!event.repeat) {
          onExit()
        }
      } else if (state && !event.isComposing) {
        if (action === 'toggleSelection') {
          if (!event.repeat) {
            state.anchor = state.anchor ? null : { ...state.cursor }
            renderStatus()
          }
        } else if (action === 'copy') {
          if (!event.repeat) {
            void copy()
          }
        } else {
          moveCopyModeCursor(terminal, state, action)
        }
        render()
      }
      return true
    },
    dispose() {
      if (disposed) {
        return
      }
      disposed = true
      resize.disconnect()
      scroll.dispose()
      status.unmount()
      snapshot.dispose()
      state = null
    }
  }
}

export type TerminalCopyModeView = ReturnType<typeof createTerminalCopyModeView>
