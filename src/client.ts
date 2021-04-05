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
  getAudio,
  toKebabCase,
} from './helpers'

import { SessionUA, ISessionImpl, CallDirectionEnum } from './session'

import { Media } from './media'

const pusher = new Pusher(process.env.PUSHER_KEY, {
  cluster: 'us2',
  encrypted: true,
})

export enum ClientStatus {
  INVITE = 'invite',
  INVITE_REJECTED = 'invite_rejected',
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

interface IIceServerAttribute {
  urls: string[]
  username?: string
  credential?: string
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

  _transportLib: 'sip.js' | 'jsSIP'
  _userAgent: UserAgent
  _userAgentSession: Session
  _registerer: Registerer
  _currentSession: SessionUA
  _activeSession: boolean

  /** Related to States */
  acceptInboundCalls = false
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

    Media.source = {
      remoteSource: getAudio('__tokyRemoteAudio'),
      localSource: getAudio('__tokyLocalAudio'),
      ringAudio,
      errorAudio,
      incomingRingAudio,
    }

    this.emit(ClientStatus.DEFAULT)
  }

  /**
   * .init() is where we get the Toky Phone Params to establish communication with the Toky Phone System
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

    Media.init().then(() => {
      if (isDevelopment) {
        console.warn('Media init success...')
      }
    })

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
      Media.source.incomingRingAudio.play().then(() => {
        if (isDevelopment) {
          console.warn('-- audio play succeed on incoming session')
        }
      })
    }

    if (isFromAgent && this.acceptInboundCalls) {
      this._currentSession = new SessionUA(
        incomingSession,
        Media.source,
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
        Media.source,
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
        Media.source,
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

  // Function which recursively attempts reconnection
  private attemptReconnection = (reconnectionAttempt = 1): void => {
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

  private outboundCallURI = (phoneNumber: string): URI =>
    UserAgent.makeURI(
      `sip:service@${this._tokyDomain};company=${this._companyId};dnis=${phoneNumber}`
    )

  /**
   * PUBLIC METHODS
   */
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

      if (Media.hasMediaPermissions) {
        const inviter = new Inviter(
          this._userAgent,
          this.outboundCallURI(phoneNumber),
          options
        )

        this.emit(ClientStatus.CONNECTING)

        this._currentSession = new SessionUA(
          inviter,
          Media.source,
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
