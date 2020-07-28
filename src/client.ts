import {
  UserAgent,
  Session,
  SIPExtension,
  Invitation,
  Inviter,
  UserAgentOptions,
  Registerer,
  URI,
  RegistererState,
  version,
} from 'sip.js'

import { EventEmitter } from 'events'

import { getCallParams, IWSServers } from './toky-services'

import packageJson from '../package.json'

import {
  browserSpecs,
  isDevelopment,
  appendMediaElements,
  isChrome,
  eqSet,
  getAudio,
} from './helpers'

import { SessionUA, ISessionImpl, CallDirectionEnum } from './session'

export enum ClientStatus {
  INVITE = 'invite',
  REGISTERING = 'registering',
  REGISTRATION_FAILED = 'registration_failed',
  REGISTERED = 'registered',
  DEFAULT = 'default',
  READY = 'ready',
  DISCONNECTED = 'disconnected',
}

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

interface IAccountAttribute {
  /** Agent id registered in Toky */
  user: string
  /** Type of user that request the service */
  type: 'agent'
  /** App Name displayed in Server */
  name: string
  /** SIP username in Toky Telephone Service */
  sipUsername?: string
}

interface IMediaSpec {
  /** Url of the ring audio that would be used */
  ringAudio: string
  errorAudio: string
  incomingRingAudio: string
}

export interface IMediaAttribute {
  /** Url of the ring audio that would be used */
  remoteSource: HTMLAudioElement
  localSource: HTMLAudioElement
  ringAudio: HTMLAudioElement
  errorAudio: HTMLAudioElement
  incomingRingAudio: HTMLAudioElement
}

interface IIceServerAttribute {
  urls: string[]
  username?: string
  credential?: string
}

interface IDeviceList {
  id: string
  name: string
  kind: string
}

interface HTMLMediaElementExp extends HTMLMediaElement {
  // Listed as experimental in https://developer.mozilla.org/es/docs/Web/API/HTMLMediaElement
  setSinkId: any
}

declare interface IClientImpl {
  // * Private Methods
  /*
  onNotify: (message: string) => void
  subscribeToTransport: (userAgent: UserAgent) => void
  setupUserAgentListeners: (userAgent: UserAgent) => void
  setupSessionListeners: (session: Session) => void
  setupSessionDescriptionHandlerListeners: (
    sessionDescriptionHandler: Web.SessionDescriptionHandler
  ) => void
  trackAddedHandler: () => void
  acceptedHandler: () => void
  stopAudio: (sound: HTMLAudioElement) => void
  cleanupMedia: () => void
  */
  init: () => Promise<void>
  register: () => void
  startCall: (options: {
    phoneNumber: string
    callerId: string
  }) => ISessionImpl
  on: (event: ClientStatus, listener: () => void) => void
}

export class Client extends EventEmitter implements IClientImpl {
  /** Related to Toky Settings */
  _apiKey: string
  _account: IAccountAttribute
  _companyId: string
  _tokyDomain: string
  _connectionCountry: string
  _appName: string
  _tokyIceServers: IIceServerAttribute[]

  _media: IMediaAttribute

  _transportLib: 'sip.js' | 'jsSIP'
  _userAgent: UserAgent
  _userAgentSession: Session
  _registerer: Registerer
  _localStream: MediaStream
  _deviceList: IDeviceList[]

  /** Related to States */
  hasMediaPermissions = false
  isRegistering = false
  isRegistered = false
  isTransportConnecting = false
  isTransportConnected = false

  subscription = undefined
  serverUri: URI = undefined

  constructor({
    apiKey,
    account,
    transportLib,
    media,
  }: {
    apiKey: string
    account: IAccountAttribute
    transportLib: 'sip.js' | 'jsSIP'
    media: IMediaSpec
  }) {
    super()

    if (!apiKey) {
      throw new Error('Required options should be provided: apiKey')
    }

    if (
      !account.user ||
      !account.type ||
      !account.name ||
      !account.hasOwnProperty('user') ||
      !account.hasOwnProperty('type') ||
      !account.hasOwnProperty('name')
    ) {
      let errorMessage = 'Required options should be provided: '

      if (!account.hasOwnProperty('user') || !account.user) {
        errorMessage += 'account.user '
      }

      if (!account.hasOwnProperty('type') || !account.type) {
        errorMessage += 'account.type '
      }

      if (!account.hasOwnProperty('name') || !account.name) {
        errorMessage += 'account.name'
      }

      throw new Error(errorMessage)
    }

    if (version !== '0.16.1') {
      throw new Error(`SIP.js ${version} not supported, required 0.16.1`)
    }

    this._apiKey = apiKey
    this._account = account
    this._appName = account.name
    this._transportLib = transportLib

    appendMediaElements()

    const incomingRingAudio = new Audio(media.incomingRingAudio)
    const errorAudio = new Audio(media.errorAudio)
    const ringAudio = new Audio(media.ringAudio)

    ringAudio.loop = true
    incomingRingAudio.loop = true

    this._media = {
      remoteSource: getAudio('__tokyRemoteAudio'),
      localSource: getAudio('__tokyLocalAudio'),
      ringAudio,
      errorAudio,
      incomingRingAudio,
    }

    this.emit(ClientStatus.DEFAULT)
  }

  /**
   * Init is where we call the Toky API to get call params
   * and it establish communication with the Toky Server
   */

  public async init(): Promise<any> {
    const response = await getCallParams({
      agentId: this._account.user,
      apiKey: this._apiKey,
    })

    this.mediaInit()

    const paramsData = response.data

    this._companyId = paramsData.company_id
    this._tokyDomain = paramsData.sip.domain
    this._connectionCountry = paramsData.connection_country
    this._account.sipUsername = paramsData.sip.username

    if (this._transportLib === 'sip.js') {
      const paramsTurnServers = paramsData.sip.turn_servers

      const iceServers: IIceServerAttribute[] = [
        {
          urls: paramsTurnServers.urls,
          username: paramsTurnServers.username,
          credential: paramsTurnServers.password,
        },
        { urls: paramsData.sip.stun_servers },
      ]

      this._tokyIceServers = iceServers

      const wsServersConf = paramsData.sip.ws_servers.map(
        (server: IWSServers) => ({
          wsUri: server.ws_uri,
          weight: server.weight,
        })
      )

      this.serverUri = UserAgent.makeURI(`sip:${paramsData.sip.uri}`)

      if (!this.serverUri) {
        throw new Error('Failed to create toky server uri.')
      }

      const displayName = `${this._appName} - Toky SDK`

      const options: UserAgentOptions = {
        uri: this.serverUri,
        transportOptions: {
          server: wsServersConf[0].wsUri,
          traceSip: isDevelopment ? true : false,
        },
        authorizationUsername: this._account.sipUsername,
        authorizationPassword: paramsData.sip.password,
        userAgentString: `toky/${packageJson.name}-${packageJson.version}/${browserSpecs.name}-${browserSpecs.version}`,
        logBuiltinEnabled: true,
        logLevel: 'debug',
        allowLegacyNotifications: true,
        sipExtension100rel: SIPExtension.Supported,
        displayName,
        sessionDescriptionHandlerFactoryOptions: {
          alwaysAcquireMediaFirst: true,
          peerConnectionOptions: {
            rtcConfiguration: {
              iceServers,
            },
            iceCheckingTimeout: 2000,
          },
        },
      }

      this._userAgent = new UserAgent(options)

      this.emit(ClientStatus.READY)

      this.emit(ClientStatus.REGISTERING)

      this.isRegistering = true

      /**
       * SIP js Listeners
       */
      this._userAgent.delegate = {
        onRegister: (): void => {
          // * This in alpha in SIP.js not used yet
          // this.emit(ClientStatus.REGISTERED)
          // this.isRegistering = false
          // this.isRegistered = true
          // console.log(
          //   '%c ᕙ༼ຈل͜ຈ༽ᕗ powered by toky.co ',
          //   'background: blue; color: white; font-size: small'
          // )
        },
        onInvite: (invitation: Invitation): void => {
          const incomingSession = invitation

          const transferred = incomingSession.request.getHeader('X-Transferred')

          const transferredTo = incomingSession.request.getHeader(
            'X-Transferred-To'
          )

          const transferredBy = incomingSession.request.getHeader(
            'X-Transferred-By'
          )
          const referer = incomingSession.request.getHeader('X-Referer')

          const isFromPSTN =
            incomingSession.request.getHeader('X-PSTN') === 'yes'

          const isIncomingWarmTransfer =
            incomingSession.request.getHeader('X-Warm') === 'yes'

          const companyID = incomingSession.request.getHeader('X-Company')

          const sectionId = incomingSession.request.getHeader('X-Section')

          const sectionOptionId = incomingSession.request.getHeader('X-Option')

          const ivrID = incomingSession.request.getHeader('X-IVR')

          const ivrOptionPressed = incomingSession.request.getHeader(
            'X-IVR-Option-Pressed'
          )

          const customerHasInfo =
            incomingSession.request.getHeader('X-Has-Info') !== undefined

          const customerUsername = incomingSession.request.getHeader(
            'X-Toky-Username'
          )
          const customerUri = incomingSession.remoteIdentity.uri.user

          const customerIsAnon = customerUri.indexOf('.invalid') > -1

          const customerLocation = incomingSession.request.getHeader(
            'X-Connection-Country'
          )

          const isFromAgent = incomingSession.request
            .getHeader('From')
            .includes(';agent')

          let currentSession = null

          if (!isIncomingWarmTransfer) {
            this._media.incomingRingAudio.play().then(() => {
              console.warn('-- audio play succeed on incoming session')
            })
          }

          if (isFromAgent) {
            currentSession = new SessionUA(
              incomingSession,
              this._media,
              CallDirectionEnum.INBOUND,
              {
                agentId: this._account.user,
                sipUsername: this._account.sipUsername,
                companyId: this._companyId,
                apiKey: this._apiKey,
              },
              {
                uri: customerUri,
                type: 'agent',
              }
            )

            this.emit(ClientStatus.INVITE, currentSession)

            currentSession.once('__session_terminated', () => {
              this.sessionTerminatedHandler()
              currentSession = null
            })
          }

          const isBlindTransfer =
            transferred &&
            transferredBy === this._account.sipUsername &&
            !isIncomingWarmTransfer

          const isWarmTransfer =
            transferred &&
            transferredBy === this._account.sipUsername &&
            isIncomingWarmTransfer

          /**
           * This case in when in a rejected blind transferred call
           */
          if (isBlindTransfer) {
            currentSession = new SessionUA(
              incomingSession,
              this._media,
              CallDirectionEnum.INBOUND,
              {
                agentId: this._account.user,
                sipUsername: this._account.sipUsername,
                companyId: this._companyId,
                apiKey: this._apiKey,
              },
              {
                uri: customerUri,
                type: 'agent',
                transferredType: 'blind',
                cause: 'rejected',
              }
            )

            this.emit(ClientStatus.INVITE, currentSession)

            currentSession.once('__session_terminated', () => {
              this.sessionTerminatedHandler()
              currentSession = null
            })
          }

          if (isWarmTransfer) {
            currentSession = new SessionUA(
              incomingSession,
              this._media,
              CallDirectionEnum.INBOUND,
              {
                agentId: this._account.user,
                sipUsername: this._account.sipUsername,
                companyId: this._companyId,
                apiKey: this._apiKey,
              },
              {
                uri: customerUri,
                type: 'agent',
                transferredType: 'warm',
                cause: 'establish',
              }
            )

            this.emit(ClientStatus.INVITE, currentSession)

            currentSession.once('__session_terminated', () => {
              this.sessionTerminatedHandler()
              currentSession = null
            })
          }
        },
      }

      this._userAgent
        .start()
        .then(() => {
          this._registerer = new Registerer(this._userAgent, {
            registrar: this.serverUri,
          })

          this._registerer.stateChange.addListener((newState) => {
            switch (newState) {
              case RegistererState.Registered:
                this.emit(ClientStatus.REGISTERED)

                this.isRegistering = false
                this.isRegistered = true

                console.log(
                  '%c ᕙ༼ຈل͜ຈ༽ᕗ powered by toky.co ',
                  'background: blue; color: white; font-size: small'
                )
                break
              case RegistererState.Unregistered:
                console.error('Unregistered')
                break
              case RegistererState.Terminated:
                console.error('Terminated')
                break
            }
          })

          this._registerer
            .register()
            .then((request) => {
              console.log('Successfully sent REGISTER')
              console.log('Sent request =', request)
            })
            .catch((error) => {
              console.error('Failed to send REGISTER', error)
            })
        })
        .catch((error) => {
          console.error('Failed to connect', error)
        })
    }
  }

  /**
   * @remarks
   * Media related methods, now mixed with Client class
   * maybe later can exists in its own class
   */

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

  private async mediaInit(): Promise<void> {
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

        if (devicesInfo) {
          this.gotDevices(devicesInfo)
        }
      }

      if (isChrome) {
        const permission = await navigator.permissions.query({
          name: 'microphone',
        })

        if (permission.state === 'denied') {
          console.error('-- ðŸ”¥ Mic access DENIED! Contact support@toky.co')

          alert(
            `❌ We couldn't access your microphone.\n\n
            The microphone seems to be blocked. 
            Please give Toky permission to use it or contact our support team to get help.\n\n
            https://help.toky.co/how-tos/how-to-unblock-my-microphone-access-for-toky`
          )

          this.emit(MediaStatus.PERMISSION_REVOKED)
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

      this.setOutputDevice(this.selectedOutputDevice)
    } else {
      // * We can inform this to a service error
      console.error(`This can't be happening, device info is not present.`)
      this.emit(MediaStatus.ERROR)
    }
  }

  private handleError(error): void {
    console.log(
      'navigator.MediaDevices.getUserMedia error: ',
      error.message,
      error.name
    )
    this.emit(MediaStatus.ERROR)
  }

  private outboundCallURI = (phoneNumber: string): URI =>
    UserAgent.makeURI(
      `sip:service@${this._tokyDomain};company=${this._companyId};dnis=${phoneNumber}`
    )

  /**
   * Event listeners
   */

  private onNotify(message): void {
    // const status = parseStatus(message);
    console.warn(`--- Server status: ${message}`)
  }

  private subscribeToTransport(userAgent): void {
    // To avoid having multiple listeners active.
    if (this.subscription) {
      this.subscription.removeListener('notify', this.onNotify.bind(this))
    }

    const transport = userAgent.transport

    transport.on('message', this.onNotify.bind(this))

    // // It could be that we are rate-limited, in that case, parse the
    // // retry-after header and figure out how long we should wait
    // // before subscribing again.
    // this.subscription.once('failed', (response, cause) => {
    //   const retryAfter = response.getHeader('Retry-After')

    //   setTimeout(
    //     this.subscribeToTransport.bind(this),
    //     Number(retryAfter) * 1000
    //   )
    // })
  }

  /**
   * Handlers for event listeners
   */

  private sessionTerminatedHandler(): void {
    this.isRegistered = false

    const isRegistered =
      this._registerer.state &&
      this._registerer.state === RegistererState.Registered

    if (isRegistered) {
      this.isRegistered = true
      this.emit(ClientStatus.REGISTERED)
    } else {
      this.isRegistered = false
    }
  }

  /**
   * PUBLIC METHODS
   */

  get devices(): IDeviceList[] {
    return this._deviceList
  }

  get inputs(): IDeviceList[] {
    const inputDevices = this._deviceList.filter((d) => d.kind === 'audioinput')

    if (this.selectedInputDevice) {
      const _selectedInputDevice = this.selectedInputDevice

      return [
        this._deviceList.find((d) => d.id === _selectedInputDevice),
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
      const _selectedOutputDevice = this.selectedOutputDevice

      return [
        this._deviceList.find((d) => d.id === _selectedOutputDevice),
        ...outputDevices.filter((d) => d.id !== _selectedOutputDevice),
      ]
    } else {
      return outputDevices
    }
  }

  public getDeviceById(id: string): IDeviceList {
    return this._deviceList.find((d) => d.id === id)
  }

  public async setOutputDevice(
    id: string
  ): Promise<{ success: boolean; message?: any }> {
    if ('sinkId' in HTMLMediaElement.prototype) {
      const _remoteSource = this._media.remoteSource as HTMLMediaElementExp
      const _ringAudio = this._media.ringAudio as HTMLMediaElementExp
      const _errorAudio = this._media.errorAudio as HTMLMediaElementExp
      // prettier-ignore
      const _incomingRingAudio = this._media.incomingRingAudio as HTMLMediaElementExp

      try {
        await _remoteSource.setSinkId(id)

        console.warn('successfully set sink id for remote audio')

        await _ringAudio.setSinkId(id)

        console.warn('successfully set sink id for ring audio')

        await _errorAudio.setSinkId(id)

        console.warn('successfully set sink id for error audio')

        await _incomingRingAudio.setSinkId(id)

        console.warn('successfully set sink id for incoming ring audio')

        console.warn(`Success, audio output device attached: ${id}`)

        if (typeof Storage === 'undefined') {
          throw new Error('Local Storage is not supported in this browser')
        }

        sessionStorage.setItem('toky_default_output', id)

        this.emit(MediaStatus.OUTPUT_UPDATED)

        return { success: true }
      } catch (err) {
        console.error(err)

        return {
          success: false,
          message: err,
        }
      }
    } else {
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

        console.warn(`Success, audio input device attached: ${id}`)

        if (typeof Storage === 'undefined') {
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
          console.warn('Local Storage is not supported in this browser')
        }

        sessionStorage.setItem('toky_default_input', id)

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

  get selectedInputDevice(): string {
    if (typeof Storage !== 'undefined') {
      if (sessionStorage.getItem('toky_default_input')) {
        return sessionStorage.getItem('toky_default_input')
      } else {
        return this.defaultInputDevice.id
      }
    } else {
      throw new Error('Browser does not support session storage.')
    }
  }

  get selectedOutputDevice(): string {
    if (typeof Storage !== 'undefined') {
      if (sessionStorage.getItem('toky_default_output')) {
        return sessionStorage.getItem('toky_default_output')
      } else {
        return this.defaultOutputDevice.id
      }
    } else {
      throw new Error('Browser does not support session storage.')
    }
  }

  /**
   * In Toky SDK this is done automatically in the constructor
   * with the default register option set in the User Agent (* not anymore)
   */
  public register(): void {
    // TODO: implement later
  }

  public startCall({
    phoneNumber,
    callerId,
  }: {
    phoneNumber: string
    callerId: string
  }): ISessionImpl {
    if (this.isRegistered) {
      const extraHeaders: string[] = [
        `X-Connection-Country: ${this._connectionCountry}`,
        `X-Caller-Id: ${callerId}`,
      ]

      let constrainsDefault: MediaStreamConstraints = {
        audio: true,
        video: false,
      }

      if (typeof Storage !== 'undefined') {
        if (sessionStorage.getItem('toky_default_input')) {
          const defaultDeviceId = sessionStorage.getItem('toky_default_input')
          constrainsDefault = {
            audio: { deviceId: defaultDeviceId },
            video: false,
          }
        }
      }

      const options = {
        extraHeaders,
        sessionDescriptionHandlerOptions: {
          constraints: constrainsDefault,
        },
      }

      const inviter = new Inviter(
        this._userAgent,
        this.outboundCallURI(phoneNumber),
        options
      )

      let currentSession = new SessionUA(
        inviter,
        this._media,
        CallDirectionEnum.OUTBOUND,
        {
          agentId: this._account.user,
          sipUsername: this._account.sipUsername,
          companyId: this._companyId,
          apiKey: this._apiKey,
        },
        {
          uri: this.outboundCallURI(phoneNumber),
          type: 'contact',
          phone: phoneNumber,
        }
      )

      currentSession.once('__session_terminated', () => {
        console.warn('-- session killed')
        this.sessionTerminatedHandler.bind(this)()
        currentSession = null
      })

      return currentSession
    } else {
      console.warn('need registration first')
      return null
    }
  }
}
