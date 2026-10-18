import type { Terminal } from '@xterm/xterm'

export type CopyModePosition = { row: number; column: number }
export type CopyModeSelection = {
  cursor: CopyModePosition
  anchor: CopyModePosition | null
  preferredColumn: number
}

type CopyBuffer = Pick<Terminal, 'buffer' | 'cols'>

function characterStart(terminal: CopyBuffer, row: number, column: number): number {
  const line = terminal.buffer.active.getLine(row)
  const clamped = Math.max(0, Math.min(terminal.cols - 1, column))
  return clamped > 0 && line?.getCell(clamped)?.getWidth() === 0 ? clamped - 1 : clamped
}

export function createCopyModeSelection(
  terminal: CopyBuffer,
  position: CopyModePosition
): CopyModeSelection {
  const row = Math.max(0, Math.min(terminal.buffer.active.length - 1, position.row))
  const column = characterStart(terminal, row, position.column)
  return { cursor: { row, column }, anchor: null, preferredColumn: column }
}

export function moveCopyModeCursor(
  terminal: CopyBuffer,
  state: CopyModeSelection,
  direction: 'left' | 'down' | 'up' | 'right'
): void {
  const { row, column } = state.cursor
  if (direction === 'up' || direction === 'down') {
    const nextRow = Math.max(
      0,
      Math.min(terminal.buffer.active.length - 1, row + (direction === 'up' ? -1 : 1))
    )
    state.cursor = {
      row: nextRow,
      column: characterStart(terminal, nextRow, state.preferredColumn)
    }
    return
  }
  const width = Math.max(1, terminal.buffer.active.getLine(row)?.getCell(column)?.getWidth() ?? 1)
  const nextColumn = characterStart(terminal, row, column + (direction === 'left' ? -1 : width))
  state.cursor = { row, column: nextColumn }
  state.preferredColumn = nextColumn
}

export function renderCopyModeSelection(terminal: Terminal, state: CopyModeSelection): void {
  if (!state.anchor) {
    terminal.clearSelection()
    return
  }
  const linear = (position: CopyModePosition) => position.row * terminal.cols + position.column
  const [start, end] =
    linear(state.anchor) <= linear(state.cursor)
      ? [state.anchor, state.cursor]
      : [state.cursor, state.anchor]
  const endWidth = Math.max(
    1,
    terminal.buffer.active.getLine(end.row)?.getCell(end.column)?.getWidth() ?? 1
  )
  terminal.select(start.column, start.row, linear(end) - linear(start) + endWidth)
}
