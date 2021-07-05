const browserUa: string = navigator.userAgent.toLowerCase()
export const isSafari =
  browserUa.indexOf('safari') !== -1 && browserUa.indexOf('chrome') < 0
export const isFirefox =
  browserUa.indexOf('firefox') !== -1 && browserUa.indexOf('chrome') < 0
export const isChrome =
  browserUa.indexOf('chrome') !== -1 && !isSafari && !isFirefox

export const isProduction = process.env.NODE_ENV === 'production'
export const isDevelopment = process.env.NODE_ENV === 'development'

/**
 * A minor variation of https://stackoverflow.com/questions/5916900/how-can-you-detect-the-version-of-a-browser
 * returns name but in lower case
 */
export const browserSpecs = ((): any => {
  const ua = navigator.userAgent
  let tem = null
  let M =
    ua.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i) ||
    []
  if (/trident/i.test(M[1])) {
    tem = /\brv[ :]+(\d+)/g.exec(ua) || []
    return { name: 'IE', version: tem[1] || '' }
  }
  if (M[1] === 'Chrome') {
    tem = ua.match(/\b(OPR|Edge)\/(\d+)/)
    if (tem != null)
      return { name: tem[1].replace('OPR', 'Opera'), version: tem[2] }
  }
  M = M[2] ? [M[1], M[2]] : [navigator.appName, navigator.appVersion, '-?']
  if ((tem = ua.match(/version\/(\d+)/i)) != null) M.splice(1, 1, tem[1])
  return { name: M[0].toLowerCase(), version: M[1] }
})()

export function appendMediaElements(): void {
  const remoteAudio = document.createElement('audio')

  remoteAudio.setAttribute('id', '__tokyRemoteAudio')
  remoteAudio.hidden = true
  remoteAudio.controls = true

  const localAudio = document.createElement('audio')

  localAudio.setAttribute('id', '__tokyLocalAudio')
  localAudio.muted = true
  localAudio.hidden = true

  document.body.appendChild(remoteAudio)
  document.body.appendChild(localAudio)
}

export function stopAudio(sound: HTMLAudioElement): void {
  sound.currentTime = 0
  sound.pause()
}

export function eqSet<T>(a: Set<T>, b: Set<T>): boolean {
  return a.size === b.size && [...a].every(b.has.bind(b))
}

export function getAudio(id: string): HTMLAudioElement {
  const el = document.getElementById(id)
  if (!(el instanceof HTMLAudioElement)) {
    throw new Error(`Element "${id}" not found or not an audio element.`)
  }
  return el
}

export function toKebabCase(str: string) {
  try {
    return (
      str &&
      str
        .match(
          /[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g
        )
        .map((x) => x.toLowerCase())
        .join('-')
    )
  } catch (err) {
    return ''
  }
}

export function getUserAgentKey(
  isFromPstn: boolean,
  userAgent: string
): string {
  let key = ''

  if (isFromPstn) {
    key = 'telephone-network'
  } else {
    if (userAgent.toLowerCase().includes('desktop-app')) {
      key = 'desktop-app'
    } else if (userAgent.toLowerCase().includes('b2bua')) {
      key = 'call-queued'
    } else if (userAgent.toLowerCase().includes('firefox')) {
      key = 'firefox'
      if (userAgent.toLowerCase().includes('mobile')) {
        key += '-mobile'
      }
    } else if (userAgent.toLowerCase().includes('chrome')) {
      key = 'chrome'
      if (userAgent.toLowerCase().includes('mobile')) {
        key += '-mobile'
      }
    } else if (userAgent.toLowerCase().includes('android')) {
      key = 'android'
    } else if (userAgent.toLowerCase().includes('opera')) {
      key = 'opera'
    } else if (userAgent.toLowerCase().includes('intercom-messeger')) {
      key = 'intercom-messeger'
    } else {
      key = 'toky'
    }
  }

  return key
}
