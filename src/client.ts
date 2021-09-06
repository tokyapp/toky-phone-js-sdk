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
  IAccount,
  IMediaSpec,
  IIceServer,
  IClient,
  ISession,
  IClientSetting,
  ICallDataEvent,
} from './interfaces'

import { ClientStatus, CallDirectionEnum } from './constants'

import {
  browserSpecs,
  isDevelopment,
  appendMediaElements,
  getAudio,
  toKebabCase,
  getUserAgentKey,
} from './helpers'

import { SessionUA } from './session'

import { Media } from './media'

const pusher = new Pusher(process.env.PUSHER_KEY, {
  cluster: 'us2',
  encrypted: true,
})

const tokyResourcesUrl = process.env.TOKY_RESOURCES_URL

if (!tokyResourcesUrl) {
  throw new Error('Something went wrong trying to get audio resources url.')
}

const defaultAudio = {
  ringAudio: `${tokyResourcesUrl}/resources/audio/ringing.ogg`,
  incomingRingAudio: `${tokyResourcesUrl}/resources/audio/piano-ring.ogg`,
  errorAudio: `${tokyResourcesUrl}/resources/audio/error.ogg`,
}

export class Client extends EventEmitter implements IClient {
  /** Related to Toky Settings */
  _accessToken: string
  _account: IAccount
  _companyId: string
  _tokyDomain: string
  _connectionCountry: string
  _appName: string
  _tokyIceServers: IIceServer[]
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
    account: IAccount
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
      !Object.prototype.hasOwnProperty.call(account, 'user') ||
      !Object.prototype.hasOwnProperty.call(account, 'type')
    ) {
      let errorMessage = 'Required options should be provided: '

      if (
        !Object.prototype.hasOwnProperty.call(account, 'user') ||
        !account.user
      ) {
        errorMessage += 'account.user '
      }

      if (
        !Object.prototype.hasOwnProperty.call(account, 'type') ||
        !account.type
      ) {
        errorMessage += 'account.type '
      }

      throw new Error(errorMessage)
    }

    /**
     * Accept inbound calls, default is true
     * review behaviour for warm rejected transferred calls
     */

    if (!Object.prototype.hasOwnProperty.call(account, 'acceptInboundCalls')) {
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
        Object.prototype.hasOwnProperty.call(media, 'incomingRingAudio') &&
        media.incomingRingAudio
      ) {
        _incomingRingAudio = media.incomingRingAudio
      }

      if (
        Object.prototype.hasOwnProperty.call(media, 'errorAudio') &&
        media.errorAudio
      ) {
        _errorAudio = media.errorAudio
      }

      if (
        Object.prototype.hasOwnProperty.call(media, 'ringAudio') &&
        media.ringAudio
      ) {
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
   * Toky Client .init() is were we get the Toky Phone Params to establish communication with the Toky Phone System
   *
   * @returns {IClientSetting} - Returns data related to the Agent Settings
   */
  public async init(): Promise<IClientSetting> {
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

      const iceServers: IIceServer[] = [
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

    const userAgent = incomingSession.request.getHeader('User-Agent')

    const callingTo = incomingSession.request.getHeader('X-Calling-To')

    const companyID = incomingSession.request.getHeader('X-Company')

    const from = incomingSession.request.getHeader('From')

    const isIncomingWarmTransfer =
      incomingSession.request.getHeader('X-Warm') === 'yes'

    // transferred header is deprecated
    const transferred = incomingSession.request.getHeader('X-Transferred')

    const transferredBy = incomingSession.request.getHeader('X-Transferred-By')

    const transferredTo = incomingSession.request.getHeader('X-Transferred-To')

    const referer = incomingSession.request.getHeader('X-Referer')

    const isFromPSTN = incomingSession.request.getHeader('X-PSTN') === 'yes'

    const sectionID = incomingSession.request.getHeader('X-Section')

    const sectionOptionID = incomingSession.request.getHeader('X-Option')

    const ivrID = incomingSession.request.getHeader('X-IVR')

    const ivrOptionPressed = incomingSession.request.getHeader(
      'X-IVR-Option-Pressed'
    )

    const customerHasInfo =
      incomingSession.request.getHeader('X-Has-Info') !== undefined

    const customerUsername =
      incomingSession.request.getHeader('X-Toky-Username')

    const customerUri = incomingSession.remoteIdentity.uri.user

    const customerIsAnon = customerUri.indexOf('.invalid') > -1

    const customerLocation = incomingSession.request.getHeader(
      'X-Connection-Country'
    )

    /**
     * Call from another Agent
     */
    const isFromAgent =
      incomingSession.request.getHeader('X-Direct-Agent-Call') === 'yes' ||
      incomingSession.request.getHeader('From').includes(';agent')

    /**
     * Rejected Blind Transfer
     */
    const isRejectedBlindTransfer =
      transferred &&
      transferredBy === this._account.sipUsername &&
      !isIncomingWarmTransfer

    /**
     * Warm Transfer
     */
    const isWarmTransfer =
      transferred &&
      transferredBy === this._account.sipUsername &&
      isIncomingWarmTransfer

    /**
     * Incoming Warm Transfer Calls are ignored because an INVITE is generated when the two agents are talking
     * acceptInboundCalls: Toky Client setting to ignore INVITE (inbound calls), defaults to: true
     *
     * @example
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
      // User Type
      let userType: 'contact' | 'agent' | 'anon' = 'contact'
      if (isFromAgent) {
        userType = 'agent'
      }

      if (customerIsAnon) {
        userType = 'anon'
      }

      let callData: ICallDataEvent = {
        remoteUserId: customerIsAnon ? '' : customerUri,
        remoteUserType: userType,
      }

      if (customerIsAnon) {
        const remoteUserName = from.split('"')
        callData = {
          ...callData,
          remoteUserName: remoteUserName.length > 2 ? remoteUserName[1] : '',
        }
      }

      // Location
      if (customerLocation) {
        callData = {
          ...callData,
          remoteUserLocation: customerLocation,
        }
      }

      // DID
      if (callingTo) {
        callData = {
          ...callData,
          did: callingTo,
        }
      }

      // IVR
      if (ivrID) {
        callData = {
          ...callData,
          ivrId: ivrID,
          ivrOptionPressed: ivrOptionPressed,
        }
      }

      // User Agent
      if (userAgent) {
        callData = {
          ...callData,
          userAgent: getUserAgentKey(isFromPSTN, userAgent),
        }
      }

      console.info(callData)

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
          type: userType,
        }
      )

      this.emit(ClientStatus.INVITE, {
        session: this._currentSession,
        agentData: {
          agentId: this._account.user,
          sipUsername: this._account.sipUsername,
          companyId: this._companyId,
        },
        callData: callData,
      })

      this.prepateActiveSession()
    }

    /**
     * Rejected Blind Transfer
     */
    if (isRejectedBlindTransfer) {
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
          .catch(() => {
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

  /**
   * Internal method to build the Toky SIP URI
   *
   * @param {string} phoneNumber - Phone Number to create the Toky SIP URI
   * @returns {URI} - Returns a builded Toky SIP URI
   */
  private outboundCallURI = (phoneNumber: string): URI =>
    UserAgent.makeURI(
      `sip:service@${this._tokyDomain};company=${this._companyId};dnis=${phoneNumber}`
    )

  /**
   * Method for Access Token Refresh after expiration
   *
   * @param {string} accessToken - new Access Token provided by Toky API
   *
   * @returns {void}
   */
  public refreshAccessToken(accessToken: string): void {
    if (this._activeSession) {
      this._currentSession.refreshAccessToken(accessToken)
    }
    this._accessToken = accessToken
  }

  /**
   * Main Start Call method that establish a call and returns an ISession
   *
   * @param {Object} callData - Object with call data params
   * @param {string} callData.phoneNumber - Phone Number to call
   * @param {string} callData.callerId - Caller Id to use for the call
   *
   * @returns {ISession} - Returns a successfully established session or null if something went wrong
   */
  public startCall({
    phoneNumber,
    callerId,
  }: {
    phoneNumber: string
    callerId: string
  }): ISession {
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
        return null
      }
    } else {
      if (isDevelopment) {
        console.warn('need registration first')
      }
      return null
    }
  }
}
