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

import Pusher, { Channel } from 'pusher-js'

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
  toKebabCase,
} from './helpers'

import { SessionUA, ISessionImpl, CallDirectionEnum } from './session'

const pusher = new Pusher(process.env.PUSHER_KEY, {
  cluster: 'us2',
  encrypted: true,
})

export enum ClientStatus {
  INVITE = 'invite',
  INVITE_REJECTED = 'INVITE_REJECTED',
  REGISTERING = 'registering',
  CONNECTING = 'connecting',
  ONLINE = 'online',
  OFFLINE = 'offline',
  UNREGISTERED = 'unregistered',
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
  /** SIP username in Toky Telephone Service */
  sipUsername?: string
  /** Option to accept inbound calls */
  acceptInboundCalls?: boolean
  /** Recording permissions */
  callRecordingEnabled: boolean
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
  init: () => Promise<{ connectionCountry: string }>
  startCall: (options: {
    phoneNumber: string
    callerId: string
  }) => ISessionImpl
  on: (event: ClientStatus, listener: () => void) => void
}

const tokyResourcesUrl = process.env.TOKY_RESOURCES_URL

if (!tokyResourcesUrl) {
  throw new Error('Something went wrong trying to get audio resources url.')
}

const defaultAudio = {
  ringAudio: `${tokyResourcesUrl}/resources/audio/ringing.ogg`,
  incomingRingAudio: `${tokyResourcesUrl}/resources/audio/piano-ring.ogg`,
  errorAudio: `${tokyResourcesUrl}/resources/audio/error.ogg`,
}

export class Client extends EventEmitter implements IClientImpl {
  /** Related to Toky Settings */
  _accessToken: string
  _account: IAccountAttribute
  _companyId: string
  _tokyDomain: string
  _connectionCountry: string
  _appName: string
  _tokyIceServers: IIceServerAttribute[]
  _tokyChannel: Channel

  _media: IMediaAttribute

  _transportLib: 'sip.js' | 'jsSIP'
  _userAgent: UserAgent
  _userAgentSession: Session
  _registerer: Registerer
  _localStream: MediaStream
  _deviceList: IDeviceList[]
  _devicesInfoRaw: MediaDeviceInfo[]
  _currentSession: SessionUA
  _activeSession: boolean

  /** Related to States */
  acceptInboundCalls = false
  hasMediaPermissions = false
  isRegistering = false
  isRegistered = false
  isTransportConnecting = false
  isTransportConnected = false

  // * Variables used for reconnection
  // Number of times to attempt reconnection before giving up
  _reconnectionAttempts = 3
  // Number of seconds to wait between reconnection attempts
  _reconnectionDelay = 4
  // Used to guard against overlapping reconnection attempts
  _attemptingReconnection = false
  // If false, reconnection attempts will be discontinued or otherwise prevented
  _shouldBeConnected = true

  subscription = undefined
  serverUri: URI = undefined

  constructor({
    accessToken,
    account,
    transportLib,
    media,
  }: {
    accessToken: string
    account: IAccountAttribute
    transportLib: 'sip.js' | 'jsSIP'
    media: IMediaSpec
  }) {
    super()

    if (!accessToken) {
      throw new Error('Required options should be provided: accessToken')
    }

    if (
      !account.user ||
      !account.type ||
      !account.hasOwnProperty('user') ||
      !account.hasOwnProperty('type')
    ) {
      let errorMessage = 'Required options should be provided: '

      if (!account.hasOwnProperty('user') || !account.user) {
        errorMessage += 'account.user '
      }

      if (!account.hasOwnProperty('type') || !account.type) {
        errorMessage += 'account.type '
      }

      throw new Error(errorMessage)
    }

    /**
     * Accept inbound calls, default is true
     * review behaviour for warm rejected transferred calls
     */

    if (!account.hasOwnProperty('acceptInboundCalls')) {
      this.acceptInboundCalls = true
    } else {
      this.acceptInboundCalls = Boolean(account.acceptInboundCalls)
    }

    if (version !== '0.16.1') {
      throw new Error(`SIP.js ${version} not supported, required 0.16.1`)
    }

    this._accessToken = accessToken
    this._account = account
    this._transportLib = transportLib

    appendMediaElements()

    let _incomingRingAudio = defaultAudio.incomingRingAudio
    let _errorAudio = defaultAudio.errorAudio
    let _ringAudio = defaultAudio.ringAudio

    if (media) {
      if (
        media.hasOwnProperty('incomingRingAudio') &&
        media.incomingRingAudio
      ) {
        _incomingRingAudio = media.incomingRingAudio
      }

      if (media.hasOwnProperty('errorAudio') && media.errorAudio) {
        _errorAudio = media.errorAudio
      }

      if (media.hasOwnProperty('ringAudio') && media.ringAudio) {
        _ringAudio = media.ringAudio
      }
    }

    const incomingRingAudio = new Audio(_incomingRingAudio)
    const errorAudio = new Audio(_errorAudio)
    const ringAudio = new Audio(_ringAudio)

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

  public async init(): Promise<{
    connectionCountry: string
    sipUsername: string
    callRecordingEnabled: boolean
  }> {
    const response = await getCallParams({
      agentId: this._account.user,
      accessToken: this._accessToken,
    })

    this.mediaInit()

    const paramsData = response.data

    this._tokyChannel = pusher.subscribe(
      `toky-channel-${paramsData.channel_id}`
    )
    this._companyId = paramsData.company_id
    this._tokyDomain = paramsData.sip.domain
    this._connectionCountry = paramsData.connection_country
    this._account.sipUsername = paramsData.sip.username
    this._account.callRecordingEnabled = paramsData.recording_change
    this._appName = paramsData.registered_app_name

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
        userAgentString: `toky/${toKebabCase(this._appName)}/${
          packageJson.name
        }-${packageJson.version}/${browserSpecs.name}-${browserSpecs.version}`,
        logBuiltinEnabled: true,
        logLevel: isDevelopment ? 'debug' : 'error',
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

      /**
       * SIP.js Listeners
       */
      this._userAgent.delegate = {
        onDisconnect: this.onDisconnect.bind(this),
        onConnect: this.onConnect.bind(this),
        onInvite: this.onInvite.bind(this),
      }

      this._userAgent
        .start()
        .then(this.register.bind(this))
        .catch((error) => {
          if (isDevelopment) console.error('Failed to connect', error)
        })

      window.addEventListener('online', this.onOnline.bind(this))
      window.addEventListener('offline', this.onOffline.bind(this))
    }

    return {
      connectionCountry: this._connectionCountry,
      sipUsername: this._account.sipUsername,
      callRecordingEnabled: this._account.callRecordingEnabled,
    }
  }

  // Function which recursively attempts reconnection
  attemptReconnection = (reconnectionAttempt = 1): void => {
    // If not intentionally connected, don't reconnect.
    if (!this._shouldBeConnected) {
      return
    }

    // Reconnection attempt already in progress
    if (this._attemptingReconnection) {
      return
    }

    // Reconnection maximum attempts reached
    if (reconnectionAttempt > this._reconnectionAttempts) {
      return
    }

    // We're attempting a reconnection
    this._attemptingReconnection = true

    if (isDevelopment) console.warn('-- attempting reconnection.')

    setTimeout(
      () => {
        // If not intentionally connected, don't reconnect.
        if (!this._shouldBeConnected) {
          this._attemptingReconnection = false
          return
        }
        // Attempt reconnect
        this._userAgent
          .reconnect()
          .then(() => {
            // Reconnect attempt succeeded
            this._attemptingReconnection = false
            this.emit(ClientStatus.ONLINE)
          })
          .catch((error: Error) => {
            // Reconnect attempt failed
            this._attemptingReconnection = false
            this.attemptReconnection(++reconnectionAttempt)
          })
      },
      reconnectionAttempt === 1 ? 0 : this._reconnectionDelay * 1000
    )
  }

  /**
   * Devices
   *
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

  private outboundCallURI = (phoneNumber: string): URI =>
    UserAgent.makeURI(
      `sip:service@${this._tokyDomain};company=${this._companyId};dnis=${phoneNumber}`
    )

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

  private onInvite(invitation: Invitation): void {
    const incomingSession = invitation

    const transferred = incomingSession.request.getHeader('X-Transferred')

    const transferredTo = incomingSession.request.getHeader('X-Transferred-To')

    const transferredBy = incomingSession.request.getHeader('X-Transferred-By')
    const referer = incomingSession.request.getHeader('X-Referer')

    const isFromPSTN = incomingSession.request.getHeader('X-PSTN') === 'yes'

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

    /**
     * Call from another Agent
     */
    const isFromAgent = incomingSession.request
      .getHeader('From')
      .includes(';agent')

    /**
     * Blind transfer call
     */
    const isBlindTransfer =
      transferred &&
      transferredBy === this._account.sipUsername &&
      !isIncomingWarmTransfer

    /**
     * Warm transfer call
     */
    const isWarmTransfer =
      transferred &&
      transferredBy === this._account.sipUsername &&
      isIncomingWarmTransfer

    /**
     * Incoming Warm Transfer Calls are ignored because an INVITE is generated when the two agents are talking
     * acceptInboundCalls: Toky Client setting to ignore INVITE (inbound calls), defaults to: true
     *
     * @example:
     *
     * ```js
     * new TokyClient({
     *   accessToken: accessToken.value,
     *   account: {
     *     user: agentId,
     *     type: 'agent',
     *   },
     *   transportLib: 'sip.js',
     *   acceptInboundCalls: false
     * })
     * ```
     */
    if (!isIncomingWarmTransfer && this.acceptInboundCalls) {
      this._media.incomingRingAudio.play().then(() => {
        if (isDevelopment) {
          console.warn('-- audio play succeed on incoming session')
        }
      })
    }

    if (isFromAgent && this.acceptInboundCalls) {
      this._currentSession = new SessionUA(
        incomingSession,
        this._media,
        this._tokyChannel,
        CallDirectionEnum.INBOUND,
        {
          agentId: this._account.user,
          sipUsername: this._account.sipUsername,
          companyId: this._companyId,
          accessToken: this._accessToken,
        },
        {
          uri: customerUri,
          type: 'agent',
        }
      )

      this.emit(ClientStatus.INVITE, {
        session: this._currentSession,
        agentData: {
          agentId: this._account.user,
          sipUsername: this._account.sipUsername,
          companyId: this._companyId,
        },
        callData: {
          remoteUserId: customerUri,
          remoteUserType: 'agent',
        },
      })

      this.prepateActiveSession()
    }

    /**
     * Case for a rejected Blind Transferred Call
     */
    if (isBlindTransfer) {
      this._currentSession = new SessionUA(
        incomingSession,
        this._media,
        this._tokyChannel,
        CallDirectionEnum.INBOUND,
        {
          agentId: this._account.user,
          sipUsername: this._account.sipUsername,
          companyId: this._companyId,
          accessToken: this._accessToken,
        },
        {
          uri: customerUri,
          type: 'agent',
          transferredType: 'blind',
          cause: 'rejected',
        }
      )

      this.emit(ClientStatus.INVITE, {
        session: this._currentSession,
        agentData: {
          agentId: this._account.user,
          sipUsername: this._account.sipUsername,
          companyId: this._companyId,
        },
        callData: {
          remoteUserId: customerUri,
          remoteUserType: 'agent',
          transferredType: 'blind',
          cause: 'rejected',
        },
      })

      this.prepateActiveSession()
    }

    if (isWarmTransfer) {
      this._currentSession = new SessionUA(
        incomingSession,
        this._media,
        this._tokyChannel,
        CallDirectionEnum.INBOUND,
        {
          agentId: this._account.user,
          sipUsername: this._account.sipUsername,
          companyId: this._companyId,
          accessToken: this._accessToken,
        },
        {
          uri: customerUri,
          type: 'agent',
          transferredType: 'warm',
          action: 'establish',
        }
      )

      this.emit(ClientStatus.INVITE, {
        session: this._currentSession,
        agentData: {
          agentId: this._account.user,
          sipUsername: this._account.sipUsername,
          companyId: this._companyId,
        },
        callData: {
          remoteUserUri: customerUri,
          remoteUserType: 'agent',
          transferredType: 'warm',
          action: 'establish',
        },
      })

      this.prepateActiveSession()
    }
  }

  private onDisconnect(error?: Error): void {
    if (isDevelopment) console.warn('-- disconnect event')

    if (this._registerer) {
      const registered =
        this._registerer.state &&
        this._registerer.state === RegistererState.Registered

      if (registered) {
        this._registerer
          .unregister()
          .then(() => {
            this.isRegistered = false
          })
          .catch((e: Error) => {
            // Unregister failed
            if (isDevelopment) {
              console.error(
                'Failed to send UNREGISTERED or failed on Disconnect Event',
                e
              )
            }
          })
      }
      // Only attempt to reconnect if network/server dropped the connection (if there is an error)
      if (error) {
        this.attemptReconnection()
      }
    }
  }

  private onConnect(): void {
    if (isDevelopment) console.warn('-- connected event')

    if (this._registerer) {
      const isRegistered =
        this._registerer.state &&
        this._registerer.state === RegistererState.Registered

      if (isRegistered) {
        this.isRegistered = true
        this.emit(ClientStatus.REGISTERED)
      } else {
        this._registerer
          .register()
          .then((request) => {
            if (isDevelopment) {
              console.log('Successfully sent REGISTER on Connect event')
              console.log('Sent request =', request)
            }
          })
          .catch((error) => {
            if (isDevelopment) {
              console.error('Failed to send REGISTER', error)
            }
          })
      }
    }
  }

  private register(): void {
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
          this.emit(ClientStatus.UNREGISTERED)

          this.isRegistered = false
          break
        case RegistererState.Terminated:
          if (isDevelopment) console.error('Terminated')
          break
      }
    })

    if (this.isRegistered === false) {
      this.emit(ClientStatus.REGISTERING)

      this.isRegistering = true

      this._registerer
        .register()
        .then((request) => {
          if (isDevelopment) {
            console.log('Successfully sent REGISTER')
            console.log('Sent request =', request)
          }
        })
        .catch((error) => {
          if (isDevelopment) console.error('Failed to send REGISTER', error)
        })
    }
  }

  private onOnline(): void {
    this.attemptReconnection()
    console.warn('browser online, attempting to reconnect')
  }

  private prepateActiveSession(): void {
    this._activeSession = true

    this._currentSession.once('__session_terminated', () => {
      this.sessionTerminatedHandler()
      this._currentSession = null
      this._activeSession = false
    })
  }

  private onOffline(): void {
    this.emit(ClientStatus.OFFLINE)
    if (isDevelopment) {
      console.warn(
        'Browser goes offline. Once online it will try to reconnect.'
      )
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
      const _remoteSource = this._media.remoteSource as HTMLMediaElementExp
      const _ringAudio = this._media.ringAudio as HTMLMediaElementExp
      const _errorAudio = this._media.errorAudio as HTMLMediaElementExp
      // prettier-ignore
      const _incomingRingAudio = this._media.incomingRingAudio as HTMLMediaElementExp

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

  public refreshAccessToken(accessToken: string): void {
    if (this._activeSession) {
      this._currentSession.refreshAccessToken(accessToken)
    }
    this._accessToken = accessToken
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

      if (this.hasMediaPermissions) {
        const inviter = new Inviter(
          this._userAgent,
          this.outboundCallURI(phoneNumber),
          options
        )

        this.emit(ClientStatus.CONNECTING)

        this._currentSession = new SessionUA(
          inviter,
          this._media,
          this._tokyChannel,
          CallDirectionEnum.OUTBOUND,
          {
            agentId: this._account.user,
            sipUsername: this._account.sipUsername,
            companyId: this._companyId,
            accessToken: this._accessToken,
            callRecordingEnabled: this._account.callRecordingEnabled,
          },
          {
            uri: this.outboundCallURI(phoneNumber),
            type: 'contact',
            phone: phoneNumber,
          }
        )

        this.prepateActiveSession()

        return this._currentSession
      } else {
        if (isDevelopment) {
          console.error(
            'Unable to acquire media, you need to grant media permissions in navigator settings.'
          )
        }

        this.emit(ClientStatus.INVITE_REJECTED, {
          code: 412,
          status: 'Conditional Request Failed',
          msg:
            'Unable to acquire media, you need to grant media permissions in navigator settings.',
        })
      }
    } else {
      if (isDevelopment) {
        console.warn('need registration first')
      }
      return null
    }
  }
}
