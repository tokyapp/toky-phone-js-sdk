export function getButtons(id) {
  const els = document.getElementsByClassName(id)
  if (!els.length) {
    throw new Error(`Elements "${id}" not found.`)
  }
  const buttons = []
  for (let i = 0; i < els.length; i++) {
    const el = els[i]
    if (!(el instanceof HTMLButtonElement)) {
      throw new Error(`Element ${i} of "${id}" not a button element.`)
    }
    buttons.push(el)
  }
  return buttons
}
