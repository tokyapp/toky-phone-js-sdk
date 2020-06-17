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
  // remoteAudio.hidden = true

  const localAudio = document.createElement('audio')

  localAudio.setAttribute('id', '__tokyLocalAudio')
  localAudio.muted = true
  // localAudio.hidden = true

  document.body.appendChild(remoteAudio)
  document.body.appendChild(localAudio)
}

export function stopAudio(sound: HTMLAudioElement): void {
  sound.currentTime = 0
  sound.pause()
}
