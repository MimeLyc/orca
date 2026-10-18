import { Terminal } from '@xterm/xterm'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import type { ManagedPane } from '@/lib/pane-manager/pane-manager'
import { activateOrcaTerminalUnicodeProvider } from '../../../../shared/terminal-unicode-provider'

export function createTerminalCopyModeSnapshot(pane: ManagedPane) {
  const source = pane.terminal
  const buffer = source.buffer.active
  const viewportY = buffer.viewportY
  const cursorRow = buffer.baseY + buffer.cursorY
  const position =
    cursorRow >= viewportY && cursorRow < viewportY + source.rows
      ? { row: cursorRow, column: buffer.cursorX }
      : { row: Math.min(buffer.length - 1, viewportY + source.rows - 1), column: 0 }
  const serialized = pane.serializeAddon.serialize({ excludeModes: true })
  const options = source.options
  const terminal = new Terminal({
    cols: source.cols,
    rows: source.rows,
    scrollback: Math.max(source.buffer.normal.length, buffer.length),
    allowProposedApi: true,
    disableStdin: true,
    cursorBlink: false,
    cursorInactiveStyle: 'none',
    fontFamily: options.fontFamily,
    fontSize: options.fontSize,
    fontWeight: options.fontWeight,
    fontWeightBold: options.fontWeightBold,
    lineHeight: options.lineHeight,
    letterSpacing: options.letterSpacing,
    minimumContrastRatio: options.minimumContrastRatio,
    drawBoldTextInBrightColors: options.drawBoldTextInBrightColors,
    theme: options.theme,
    screenReaderMode: options.screenReaderMode,
    allowTransparency: options.allowTransparency
  })
  try {
    terminal.loadAddon(new Unicode11Addon())
    activateOrcaTerminalUnicodeProvider(terminal)
  } catch (error) {
    terminal.dispose()
    throw error
  }

  const root = document.createElement('div')
  root.className = 'terminal-copy-mode'
  root.tabIndex = 0
  root.dataset.terminalCopyMode = 'true'
  root.style.backgroundColor = options.theme?.background ?? 'var(--background)'
  root.style.setProperty(
    '--copy-mode-cursor-color',
    options.theme?.cursor ?? options.theme?.foreground ?? 'var(--foreground)'
  )
  const viewport = document.createElement('div')
  viewport.className = 'terminal-copy-mode-viewport scrollbar-editor'
  const grid = document.createElement('div')
  grid.className = 'terminal-copy-mode-grid'
  const rect = source.element?.getBoundingClientRect()
  grid.style.width = `${rect?.width ?? pane.container.clientWidth}px`
  grid.style.height = `${rect?.height ?? pane.container.clientHeight}px`
  const cursor = document.createElement('div')
  cursor.className = 'terminal-copy-mode-cursor'
  cursor.setAttribute('aria-hidden', 'true')
  const status = document.createElement('div')
  root.append(viewport, status)
  viewport.append(grid)
  const parent = source.element?.parentElement ?? pane.container
  parent.append(root)
  try {
    terminal.open(grid)
  } catch (error) {
    terminal.dispose()
    root.remove()
    throw error
  }
  const screen = grid.querySelector<HTMLElement>('.xterm-screen')
  screen?.append(cursor)

  let disposed = false
  const ready = new Promise<void>((resolve) => {
    terminal.write(`${serialized}\x1b[?25l`, () => {
      if (!disposed) {
        terminal.scrollToLine(viewportY)
      }
      resolve()
    })
  })
  const onPointerDown = (event: PointerEvent): void => {
    event.stopPropagation()
    terminal.focus()
  }
  root.addEventListener('pointerdown', onPointerDown, true)
  return {
    root,
    terminal,
    cursor,
    status,
    viewport,
    screen,
    position,
    ready,
    dispose() {
      if (disposed) {
        return
      }
      disposed = true
      root.removeEventListener('pointerdown', onPointerDown, true)
      terminal.dispose()
      root.remove()
    }
  }
}
