import { EventEmitter } from 'events'

import { isDevelopment, isChrome, eqSet } from './helpers'

export enum MediaStatus {
  READY = 'ready',
  UPDATED = 'updated',
  ERROR = 'error',
  UNSUPPORTED = 'unsupported',
  PERMISSION_GRANTED = 'permission_granted',
  PERMISSION_REVOKED = 'permission_revoked',
  INPUT_UPDATED = 'input_updated',
  OUTPUT_UPDATED = 'output_updated',
}

export interface HTMLMediaElementExp extends HTMLMediaElement {
  // Listed as experimental in https://developer.mozilla.org/es/docs/Web/API/HTMLMediaElement
  setSinkId: any
}

export interface IDeviceList {
  id: string
  name: string
  kind: string
}

export interface IMediaAttribute {
  /** Url of the ring audio that would be used */
  remoteSource: HTMLAudioElement
  localSource: HTMLAudioElement
  ringAudio: HTMLAudioElement
  errorAudio: HTMLAudioElement
  incomingRingAudio: HTMLAudioElement
}

export class MediaSingleton extends EventEmitter {
  _devicesInfoRaw: MediaDeviceInfo[]
  _deviceList: IDeviceList[]
  _localStream: MediaStream
  _source: IMediaAttribute

  hasMediaPermissions = false

  public async init(): Promise<void> {
    if (this._localStream) {
      this.closeStream(this._localStream)
    }

    let isGetUserMediaSupported = false

    if (navigator.getUserMedia) {
      isGetUserMediaSupported = true
    } else if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      isGetUserMediaSupported = true
    } else {
      this.emit(MediaStatus.UNSUPPORTED)

      throw new Error(
        '<< .getUserMedia() unsupported >> Browser not supported for SDK.'
      )
    }

    if (isGetUserMediaSupported) {
      navigator.mediaDevices.ondevicechange = async (): Promise<void> => {
        const devicesInfo = await this.enumerateDevices()

        /**
         * @remarks
         * We're doing a comparison between the listed devices
         * we store the first time and then compare with the current because .ondevicechange()
         * triggers two times (see behavior) when devices change
         */
        if (this._devicesInfoRaw) {
          const newIds = new Set(devicesInfo.map((d) => d.deviceId))

          const oldIds = new Set(this._devicesInfoRaw.map((d) => d.deviceId))

          if (!eqSet(newIds, oldIds)) {
            this.gotDevices(devicesInfo)
            this._devicesInfoRaw = devicesInfo
          }
        } else if (devicesInfo) {
          this.gotDevices(devicesInfo)
          this._devicesInfoRaw = devicesInfo
        }
      }

      if (isChrome) {
        const permission = await navigator.permissions.query({
          name: 'microphone',
        })

        if (permission.state === 'denied') {
          if (isDevelopment)
            console.error('-- ðŸ”¥ Mic access DENIED! Contact support@toky.co')

          this.emit(MediaStatus.PERMISSION_REVOKED)
          this.hasMediaPermissions = false
        }

        if (permission.state === 'prompt') {
          this.getDeviceList()
        }

        if (permission.state === 'granted') {
          const devicesInfo = await this.enumerateDevices()

          if (devicesInfo) {
            this.emit(MediaStatus.PERMISSION_GRANTED)

            this.gotDevices(devicesInfo)
          } else {
            this.emit(MediaStatus.ERROR)

            throw new Error('Media error: We should not be here.')
          }
        }
      } else {
        this.getDeviceList()
      }
    }
  }

  set source(media: IMediaAttribute) {
    this._source = media
  }

  get source(): IMediaAttribute {
    return this._source
  }

  private async enumerateDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices()

    // * If label info is not available is a sign
    // * that devices permission are denied
    if (devices.length && devices[0].label) return devices

    this.emit(MediaStatus.PERMISSION_REVOKED)

    return undefined
  }

  private getDeviceList(): void {
    const constraints = {
      audio: true,
      video: false,
    }

    navigator.mediaDevices
      .getUserMedia(constraints)
      .then(this.gotStream.bind(this))
      .then(this.gotDevices.bind(this))
      .finally(() => {
        if (this._localStream) {
          this.closeStream(this._localStream)
        }

        this.emit(MediaStatus.READY)
      })
      .catch(this.handleError.bind(this))
  }

  private closeStream(stream: MediaStream): void {
    stream.getTracks().forEach((track) => track.stop())
  }

  private gotStream(stream: MediaStream): Promise<MediaDeviceInfo[]> {
    this._localStream = stream

    this.emit(MediaStatus.PERMISSION_GRANTED)

    return this.enumerateDevices()
  }

  private gotDevices(deviceInfos: MediaDeviceInfo[]): void {
    if (deviceInfos) {
      const devicesMapped = deviceInfos
        .filter((d) => d.kind === 'audiooutput' || d.kind === 'audioinput')
        .map((d) => {
          if (!d.label) return undefined
          return {
            id: d.deviceId,
            name: d.label,
            kind: d.kind,
          }
        })
        .filter((d) => d !== undefined)

      if (this._deviceList) {
        const newIds = new Set(devicesMapped.map((d) => d.id))

        const oldIds = new Set(this._deviceList.map((d) => d.id))

        if (!eqSet(newIds, oldIds)) {
          this._deviceList = devicesMapped

          this.emit(MediaStatus.UPDATED)

          return
        }
      }

      this._deviceList = devicesMapped

      this.hasMediaPermissions = true

      this.emit(MediaStatus.READY)

      this.setOutputDevice(this.selectedOutputDevice.id)
    } else {
      // * We can inform this to a service error
      if (isDevelopment)
        console.error(`This can't be happening, device info is not present.`)
      this.emit(MediaStatus.ERROR)
    }
  }

  private handleError(error): void {
    if (isDevelopment) {
      console.error(
        'navigator.MediaDevices.getUserMedia error: ',
        error.message,
        error.name
      )
    }
    this.emit(MediaStatus.ERROR)
  }

  get devices(): IDeviceList[] {
    return this._deviceList
  }

  get inputs(): IDeviceList[] {
    const inputDevices = this._deviceList.filter((d) => d.kind === 'audioinput')

    if (this.selectedInputDevice) {
      const _selectedInputDevice = this.selectedInputDevice.id

      return [
        inputDevices.find((d) => d.id === _selectedInputDevice),
        ...inputDevices.filter((d) => d.id !== _selectedInputDevice),
      ]
    } else {
      return inputDevices
    }
  }

  get outputs(): IDeviceList[] {
    const outputDevices = this._deviceList.filter(
      (d) => d.kind === 'audiooutput'
    )

    if (this.selectedOutputDevice) {
      const _selectedOutputDevice = this.selectedOutputDevice.id

      return [
        outputDevices.find((d) => d.id === _selectedOutputDevice),
        ...outputDevices.filter((d) => d.id !== _selectedOutputDevice),
      ]
    } else {
      return outputDevices
    }
  }

  private getDeviceById(id: string): IDeviceList {
    return this._deviceList.find((d) => d.id === id)
  }

  public async setOutputDevice(
    id: string
  ): Promise<{ success: boolean; message?: any }> {
    if ('sinkId' in HTMLMediaElement.prototype) {
      const _remoteSource = this._source.remoteSource as HTMLMediaElementExp
      const _ringAudio = this._source.ringAudio as HTMLMediaElementExp
      const _errorAudio = this._source.errorAudio as HTMLMediaElementExp
      // prettier-ignore
      const _incomingRingAudio = this._source.incomingRingAudio as HTMLMediaElementExp

      try {
        await _remoteSource.setSinkId(id)

        await _ringAudio.setSinkId(id)

        await _errorAudio.setSinkId(id)

        await _incomingRingAudio.setSinkId(id)

        if (isDevelopment)
          console.warn(`Success, audio output device attached: ${id}`)

        if (typeof Storage === 'undefined') {
          throw new Error('Local Storage is not supported in this browser')
        }

        sessionStorage.setItem('toky_default_output', id)

        this.emit(MediaStatus.OUTPUT_UPDATED)

        return { success: true }
      } catch (err) {
        if (isDevelopment) console.error(err)

        return {
          success: false,
          message: err,
        }
      }
    } else {
      if (isDevelopment)
        console.warn('Browser does not support output device selection.')
    }
  }

  public async setInputDevice(id: string, connection = null): Promise<any> {
    if (connection) {
      try {
        const pc = connection.pc
        const currentStream = connection.localStream

        currentStream.getTracks().forEach((track) => {
          track.stop()
        })

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: id },
          video: false,
        })

        const track = stream.getAudioTracks()[0]

        const sender = pc.getSenders().find(function (s) {
          return s.track.kind === track.kind
        })

        sender.replaceTrack(track)

        if (isDevelopment)
          console.warn(`Success, audio input device attached: ${id}`)

        if (typeof Storage === 'undefined') {
          if (isDevelopment)
            console.warn('Local Storage is not supported in this browser')
        }

        sessionStorage.setItem('toky_default_input', id)

        this.emit(MediaStatus.INPUT_UPDATED)

        return {
          success: true,
        }
      } catch (err) {
        if (isDevelopment) {
          console.error(err)
        }
        return {
          success: false,
          message: err,
        }
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: id },
          video: false,
        })

        if (typeof Storage === 'undefined') {
          if (isDevelopment)
            console.warn('Local Storage is not supported in this browser')
        }

        sessionStorage.setItem('toky_default_input', id)

        if (isDevelopment)
          console.warn(`Success, audio input device attached: ${id}`)

        this.emit(MediaStatus.INPUT_UPDATED)

        // Close the stream
        this.closeStream(stream)

        return {
          success: true,
        }
      } catch (err) {
        if (isDevelopment) {
          console.error(err)
        }
        return {
          success: false,
          message: err,
        }
      }
    }
  }

  get defaultInputDevice(): IDeviceList {
    return this._deviceList
      .filter((d) => d.kind === 'audioinput')
      .find((d) => d.id === 'default')
  }

  get defaultOutputDevice(): IDeviceList {
    return this._deviceList
      .filter((d) => d.kind === 'audiooutput')
      .find((d) => d.id === 'default')
  }

  get selectedInputDevice(): IDeviceList {
    if (typeof Storage !== 'undefined') {
      if (sessionStorage.getItem('toky_default_input')) {
        return this.getDeviceById(sessionStorage.getItem('toky_default_input'))
      } else {
        return this.getDeviceById(this.defaultInputDevice.id)
      }
    } else {
      throw new Error('Browser does not support session storage.')
    }
  }

  get selectedOutputDevice(): IDeviceList {
    if (typeof Storage !== 'undefined') {
      if (sessionStorage.getItem('toky_default_output')) {
        return this.getDeviceById(sessionStorage.getItem('toky_default_output'))
      } else {
        return this.getDeviceById(this.defaultOutputDevice.id)
      }
    } else {
      throw new Error('Browser does not support session storage.')
    }
  }
}

export const Media = new MediaSingleton()
