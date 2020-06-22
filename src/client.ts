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
} from 'sip.js'

import { EventEmitter } from 'events'

import { getCallParams, IWSServers } from './toky-services'

import { Media, HTMLMediaElementExp } from './media'

import packageJson from '../package.json'

import { browserSpecs, isDevelopment, appendMediaElements } from './helpers'

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
  _sipJsUA: UserAgent
  _userAgentSession: Session
  _registerer: Registerer

  /** Related to States */
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
      remoteSource: document.querySelector('#__tokyRemoteAudio'),
      localSource: document.querySelector('#__tokyLocalAudio'),
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

    Media.init({
      remoteSource: this._media.remoteSource as HTMLMediaElementExp,
    })

    Media.requestPermission()

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

      this._sipJsUA = new UserAgent(options)

      this.emit(ClientStatus.READY)

      this.emit(ClientStatus.REGISTERING)

      this.isRegistering = true

      /**
       * SIP js Listeners
       */

      this._sipJsUA.delegate = {
        onRegister: (): void => {
          this.emit(ClientStatus.REGISTERED)

          this.isRegistering = false
          this.isRegistered = true

          console.log(
            '%c ᕙ༼ຈل͜ຈ༽ᕗ powered by toky.co ',
            'background: blue; color: white; font-size: small'
          )
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
            transferredBy === this._account.sipUsername &&
            !isIncomingWarmTransfer

          const isWarmTransfer =
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

      this._sipJsUA
        .start()
        .then(() => {
          this._registerer = new Registerer(this._sipJsUA, {
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
    return { Media }
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
        this._sipJsUA,
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
