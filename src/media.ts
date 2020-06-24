import { EventEmitter } from 'events'
import { isDevelopment } from './helpers'

function eqSet<T>(a: Set<T>, b: Set<T>): boolean {
  return a.size === b.size && [...a].every(b.has.bind(b))
}

export interface HTMLMediaElementExp extends HTMLMediaElement {
  // Listed as experimental in https://developer.mozilla.org/es/docs/Web/API/HTMLMediaElement
  setSinkId: any
}

export class MediaSingleton extends EventEmitter {
  private allDevices = []
  private status = 'default'
  private requestPermissionPromise: Promise<void>
  private hadPermission = false
  private _remoteSource: HTMLMediaElementExp = null

  init({ remoteSource }: { remoteSource: HTMLMediaElementExp }): void {
    sessionStorage.removeItem('toky_default_input')

    this._remoteSource = remoteSource

    // const updateDeviceList = this.updateDeviceList.bind(this)

    // updateDeviceList()

    // navigator.mediaDevices.ondevicechange = updateDeviceList
  }

  private async enumerateDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices()

    console.warn('devices on enumerate devices', devices)

    if (devices.length && devices[0].label) return devices

    return undefined
  }

  private devicesMapping(devices): any[] {
    return devices
      .map((d) => {
        if (!d.label) return undefined
        return {
          id: d.deviceId,
          name: d.label,
          kind: d.kind,
        }
      })
      .filter((d) => d !== undefined)
  }

  private async updateDeviceList(): Promise<void> {
    if (this.status === 'default') {
      const devices = await this.enumerateDevices()
      const havePermission = devices !== undefined

      if (havePermission) {
        const allDevices = this.devicesMapping(devices)

        this.allDevices = allDevices
        this.emit('ready')
        this.status = 'ready'
      }
    }

    if (this.status === 'ready') {
      const devices = await this.enumerateDevices()

      const allDevices = this.devicesMapping(devices)

      const newIds = new Set(allDevices.map((d) => d.id))
      const oldIds = new Set(this.allDevices.map((d) => d.id))

      if (!eqSet(newIds, oldIds)) {
        this.allDevices = allDevices
        this.emit('devices_changed')
      }
    }
  }

  private async updatePermissions(): Promise<void> {
    const devices = await this.enumerateDevices()
    const havePermission = devices !== undefined

    console.log('devices', devices)

    if (havePermission) {
      if (!this.hadPermission) {
        this.emit('permission_granted')
      }

      this.updateDeviceList()
    } else {
      if (this.hadPermission) {
        this.emit('permission_revoked')
        this.allDevices = []
        this.emit('devices_changed')
      } else {
        this.emit('permission_not_granted')
      }
    }

    this.hadPermission = havePermission
  }

  public closeStream(stream: MediaStream): void {
    stream.getTracks().forEach((track) => track.stop())
  }

  public requestPermission(): Promise<void> {
    if (this.requestPermissionPromise) {
      return this.requestPermissionPromise
    }

    this.requestPermissionPromise = new Promise(async (resolve, reject) => {
      try {
        if (
          navigator.permissions &&
          typeof navigator.permissions.query === 'function'
        ) {
          const permission = await navigator.permissions.query({
            name: 'microphone',
          })

          if (permission.state === 'denied') {
            console.error('-- ðŸ”¥ Mic access DENIED! Contact support@toky.co')
            alert(
              "❌ We couldn't access your microphone.\n\nThe microphone seems to be blocked. Please give Toky permission to use it or contact our support team to get help.\nℹ️\nhttps://help.toky.co/how-tos/how-to-unblock-my-microphone-access-for-toky"
            )
            throw new Error('Permission denied')
          }

          if (permission.state === 'prompt') {
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: false,
            })
            // Close the stream
            this.closeStream(stream)
          }
        } else {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          })
          // Close the stream
          this.closeStream(stream)
        }

        if (!this.hadPermission) {
          await this.updatePermissions()
        }

        resolve()
      } catch (err) {
        if (
          (err.name === 'NotAllowedError' || err.name === 'Error') &&
          err.message === 'Permission denied'
        ) {
          this.emit('permission_not_granted')
        }

        if (
          err.name === 'TypeError' &&
          err.message.includes('PermissionDescriptor') &&
          err.message.includes('microphone')
        ) {
          console.warn('Handling Firefox media implementation.')

          navigator.mediaDevices
            .getUserMedia({
              audio: true,
              video: false,
            })
            .then((stream) => {
              this.closeStream(stream)

              this.updatePermissions().then(() => {
                console.warn('--- update permissions success')
                resolve()
              })
            })
        }

        reject(err)
      } finally {
        delete this.requestPermissionPromise
      }
    })

    return this.requestPermissionPromise
  }

  get defaultDevice(): any {
    return this.allDevices.find((d) => d.id === 'default')
  }

  get devices(): any {
    return this.allDevices
  }

  get inputs(): any {
    return this.allDevices.filter((d) => d.kind === 'audioinput')
  }

  get outputs(): any {
    return this.allDevices.filter((d) => d.kind === 'audiooutput')
  }

  public async checkPermission(): Promise<boolean> {
    const devices = await navigator.mediaDevices.enumerateDevices()

    if (devices.length && devices[0].label) return true
    return false
  }

  setOutputDevice(id: string): Promise<any> {
    if ('sinkId' in HTMLMediaElement.prototype) {
      return this._remoteSource
        .setSinkId(id)
        .then(() => {
          console.warn(`Success, audio output device attached: ${id}`)
          return { success: true }
        })
        .catch((err) => {
          console.error(err)
          return {
            success: false,
            message: err,
          }
        })
    } else {
      console.warn('Browser does not support output device selection.')
    }
  }

  async setInputDevice(id: string, connection = null): Promise<any> {
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

        console.warn(`Success, audio input device attached: ${id}`)
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
          console.warn('Local Storage is not supported in this browser')
        }

        sessionStorage.setItem('toky_default_input', id)

        console.warn(`Success, audio input device attached: ${id}`)

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
}

export const Media = new MediaSingleton()
