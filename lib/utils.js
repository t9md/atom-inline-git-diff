// return marker
function decorateRange (editor, range, decorationOptions) {
  const marker = editor.markBufferRange(range)
  editor.decorateMarker(marker, decorationOptions)
  return marker
}

function repositoryForPath (goalPath) {
  if (!goalPath) return
  let i = 0
  for (const directory of atom.project.getDirectories()) {
    if (goalPath === directory.getPath() || directory.contains(goalPath)) {
      return atom.project.getRepositories()[i]
    }
    i++
  }
}

async function withKeepingRelativeScrollPosition (editor, fn) {
  const pixelPositionForBufferPosition = point => editor.element.pixelPositionForBufferPosition(point)

  const cursorPosition = editor.getCursorBufferPosition()
  const oldPixelTop = pixelPositionForBufferPosition(cursorPosition).top
  await fn()
  editor.component.updateSync()
  const newPixelTop = pixelPositionForBufferPosition(cursorPosition).top
  const amountOfScrolledPixels = newPixelTop - oldPixelTop
  if (amountOfScrolledPixels !== 0) {
    editor.element.setScrollTop(editor.element.getScrollTop() + amountOfScrolledPixels)
  }
}

module.exports = {decorateRange, repositoryForPath, withKeepingRelativeScrollPosition}
