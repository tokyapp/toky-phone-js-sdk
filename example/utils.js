export function setItem(key, value) {
  window.localStorage.setItem(key, value)
}

export function getItem(key) {
  return window.localStorage.getItem(key)
}

export function removeItem(key) {
  window.localStorage.removeItem(key)
}

export function removeItems(keys) {
  keys.forEach((key) => removeItem(key))
}

export function checkRequiredValue(domElement, value) {
  domElement.style.color = 'red'
  if (value) {
    domElement.style.color = 'green'
    domElement.children[1].textContent =
      value.length > 32 ? value.substr(0, 32) + '...' : value
  }
}

export function getHtmlCollectionAsArray(className) {
  const els = document.getElementsByClassName(className)
  if (!els.length) {
    throw new Error(`Elements "${className}" not found.`)
  }
  const buttons = []
  for (const el of els) {
    buttons.push(el)
  }
  return buttons
}
