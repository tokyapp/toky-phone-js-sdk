import { EventEmitter } from 'events'

import {
  Session,
  Web,
  SessionState,
  InviterInviteOptions,
  Inviter,
  UserAgent,
  SessionReferOptions,
  Invitation,
  InvitationAcceptOptions,
} from 'sip.js'

import { IncomingResponse, OutgoingReferRequest, URI } from 'sip.js/lib/core'

import { stopAudio, isProduction } from './helpers'

import { IMediaAttribute } from './client'

import {
  holdCall,
  callRecording,
  RecordingActionEnum,
  HoldActionEnum,
  callDetails,
} from './toky-services'

const tokyResourcesUrl = isProduction
  ? process.env.TOKY_RESOURCES_URL
  : process.env.TOKY_RESOURCES_URL_DEV

if (!tokyResourcesUrl) {
  throw new Error('Something went wrong trying to get audio resources url.')
}

const defatulDTMFAudio = {
  0: `${tokyResourcesUrl}/resources/audio/dtmf/0.wav`,
  1: `${tokyResourcesUrl}/resources/audio/dtmf/1.wav`,
  2: `${tokyResourcesUrl}/resources/audio/dtmf/2.wav`,
  3: `${tokyResourcesUrl}/resources/audio/dtmf/3.wav`,
  4: `${tokyResourcesUrl}/resources/audio/dtmf/4.wav`,
  5: `${tokyResourcesUrl}/resources/audio/dtmf/5.wav`,
  6: `${tokyResourcesUrl}/resources/audio/dtmf/6.wav`,
  7: `${tokyResourcesUrl}/resources/audio/dtmf/7.wav`,
  8: `${tokyResourcesUrl}/resources/audio/dtmf/8.wav`,
  9: `${tokyResourcesUrl}/resources/audio/dtmf/9.wav`,
  pound: `${tokyResourcesUrl}/resources/audio/dtmf/pound.wav`,
  star: `${tokyResourcesUrl}/resources/audio/dtmf/star.wav`,
}

export interface IGetConnection {
  pc: RTCPeerConnection
  localStream: MediaStream
}

export enum SessionStatus {
  TRYING = 'trying',
  RINGING = 'ringing',
  ACCEPTED = 'accepted',
  TRANSFER_ACCEPTED = 'transfer_accepted',
  TRANSFER_FAILED = 'transfer_failed',
  TRANSFER_REJECTED = 'transfer_rejected',
  REJECTED = 'rejected',
  DISCONNECTED = 'disconnected',
  HOLD = 'hold',
  UNHOLD = 'unhold',
  MUTED = 'muted',
  UNMUTED = 'unmuted',
  RECORDING = 'recording',
  NOT_RECORDING = 'not_recording',
  FAILED = 'failed',
  BYE = 'bye',
}

export enum TransferEnum {
  AGENT = 'agent',
  GROUP = 'group',
  NUMBER = 'number',
}

export enum TransferOptionsEnum {
  BLIND = 'blind',
  WARM = 'warm',
}

export enum CallDirectionEnum {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}

export declare interface ISessionImpl {
  callId: string
  pauseRecordingActivated: boolean
  mute: () => void
  hold?: () => void
  record?: () => void
  endCall: () => void
  getConnection: () => IGetConnection
  on: (event: SessionStatus, listener: () => void) => void
}

interface ICallData {
  /** URI Data can be Agent SIP Username, in an outbound call
   * can be the URI generated for the Invitation
   */
  uri: string | URI
  /** Type of user involved in the call */
  type: 'agent' | 'anon' | 'contact'
  /**
   * Applicable for outbound calls or maybe inbound calls
   * with phone data
   */
  phone?: string
  /** Transferred Types Blind or Warm */
  transferredType?: 'blind' | 'warm'
  /** Applicable for Transferred calls, cause by a rejected blind transferred
   * or an Invite from a Warm transferred that requires to establish the call
   * inmediately
   */
  cause?: 'rejected'
  action?: 'establish'
}

interface ISettings {
  agentId: string
  accessToken: string
  sipUsername: string
  companyId: string
}

export class SessionUA extends EventEmitter implements ISessionImpl {
  private _callId: string
  private _peerConnection: RTCPeerConnection
  private _currentSession: Session | Inviter
  private _media: IMediaAttribute
  private _localStream: MediaStream
  private _senderEnabled: boolean
  private _hold: boolean
  private _accessToken: string
  private _sipUsername: string
  private _agentId: string
  private _companyId: string
  private _callDirection: CallDirectionEnum
  private _recordingFeatureActivated = false
  private _recording = true
  private _established = false
  private _callData: ICallData
  private _wantToWarmTransfer = false
  private _to = undefined
  private _from = undefined
  private _hangupByCurrentAgent = false
  private _timeOutEvent = null
  private TRANSFER_EVENT_DELAY = 200

  constructor(
    session: Session,
    media: IMediaAttribute,
    direction: CallDirectionEnum,
    tokySettings: ISettings,
    inboundData?: ICallData
  ) {
    super()

    this._currentSession = session
    this._media = media
    this._accessToken = tokySettings.accessToken
    this._sipUsername = tokySettings.sipUsername
    this._agentId = tokySettings.agentId
    this._companyId = tokySettings.companyId
    this._callData = inboundData

    this._senderEnabled = true
    this._hold = false
    this._recording = true

    this._callDirection = direction

    this._currentSession.stateChange.addListener(
      this.sessionStateListener.bind(this)
    )

    // Options including delegate to capture response messages
    const inviteOptions: InviterInviteOptions = {
      requestDelegate: {
        onProgress: this.progressHandler.bind(this),
        onAccept: this.acceptedHandler.bind(this),
        onReject: this.onRejectHandler.bind(this),
        onTrying: (): void => {
          // TODO: do something
        },
      },
    }

    if (direction === CallDirectionEnum.OUTBOUND) {
      this._currentSession
        .invite(inviteOptions)
        .then((request) => {
          console.log('Successfully sent INVITE')

          console.log('INVITE request = ', request)
        })
        .catch((error: Error) => {
          console.error('Failed to send INVITE', error)
        })
    }

    if (direction === CallDirectionEnum.INBOUND) {
      const incomingSession = session as Invitation

      this._callId = incomingSession.request.getHeader('Call-ID')

      if (
        this._callData.type === 'agent' &&
        this._callData.transferredType === TransferOptionsEnum.BLIND &&
        this._callData.cause === 'rejected'
      ) {
        this._timeOutEvent = setTimeout(() => {
          this.emit(SessionStatus.TRANSFER_REJECTED)
        }, this.TRANSFER_EVENT_DELAY)
      }

      /**
       * Applied for Warm transfer
       */
      if (
        this._callData.type === 'agent' &&
        this._callData.transferredType === TransferOptionsEnum.WARM &&
        this._callData.action === 'establish'
      ) {
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

        const options: InvitationAcceptOptions = {
          sessionDescriptionHandlerOptions: {
            constraints: constrainsDefault,
          },
        }

        incomingSession.accept(options)

        this._timeOutEvent = setTimeout(() => {
          this.emit(SessionStatus.TRANSFER_REJECTED)
        }, this.TRANSFER_EVENT_DELAY)
      }
    }
  }

  get callId(): string {
    return this._callId
  }

  get pauseRecordingActivated(): boolean {
    return this._recordingFeatureActivated
  }

  get to(): any {
    return this._to
  }

  get from(): any {
    return this._from
  }

  private sessionStateListener(newState: SessionState): void {
    switch (newState) {
      case SessionState.Establishing: {
        if (this._callDirection === CallDirectionEnum.OUTBOUND) {
          this._media.ringAudio.play().then(() => {
            console.warn('-- audio play succeed on establishing state')
          })

          this._localStream = new MediaStream()

          // * set as <any> this is a bug from ts or SIP.js
          // * .sessionDescriptionHandler says that does not have peerConnection
          // * but in the SIP.js examples they are using this way
          // * see: https://sipjs.com/guides/attach-media/
          const sessionDescriptionHandler = this._currentSession
            .sessionDescriptionHandler as any

          this._peerConnection = sessionDescriptionHandler.peerConnection

          this._peerConnection.getSenders().forEach((sender) => {
            if (sender.track) {
              this._localStream.addTrack(sender.track)
            }
          })

          this._media.localSource.srcObject = this._localStream

          this._media.localSource.play().then(() => {
            console.warn('-- local audio played succesfully...')
          })
        }

        break
      }
      case SessionState.Established: {
        if (this._callDirection === CallDirectionEnum.INBOUND)
          stopAudio(this._media.incomingRingAudio)

        const remoteStream = new MediaStream()

        const sessionDescriptionHandler = this._currentSession
          .sessionDescriptionHandler as any

        this._peerConnection = sessionDescriptionHandler.peerConnection

        this._peerConnection.getReceivers().forEach((receiver) => {
          if (receiver.track) {
            remoteStream.addTrack(receiver.track)
          }
        })

        this._media.remoteSource.srcObject = remoteStream

        this._media.remoteSource.play().then(() => {
          console.warn('-- remote audio played succesfully...')
        })

        if (this._callDirection === CallDirectionEnum.INBOUND) {
          this.emit(SessionStatus.ACCEPTED)
        }

        this._established = true

        break
      }
      case SessionState.Terminated: {
        console.warn('call direction', this._callDirection)
        /**
         * Warm case: this is because on outbound warm transfer call
         * the server sends an INVITE and then a BYE message and
         * we are "artificially" not notifying this to the consumer
         */
        if (this._wantToWarmTransfer === false) {
          // * internal event
          this.emit('__session_terminated')

          this.emit(SessionStatus.BYE, {
            origin: 'terminatedEvent',
          })

          if (this._callDirection === CallDirectionEnum.INBOUND)
            stopAudio(this._media.incomingRingAudio)

          this.cleanupMedia()

          if (this._timeOutEvent) clearTimeout(this._timeOutEvent)
        }

        break
      }
    }
  }

  private onRejectHandler(response: IncomingResponse): void {
    console.log('reject for some reason', response)
    const message = response.message

    if (
      message.reasonPhrase === 'No credit left' ||
      message.statusCode === 402
    ) {
      console.error('Not credit left')

      this.emit('No credit left', { origin: 'rejectedEvent' })
    }
    this.emit(SessionStatus.REJECTED, { origin: 'rejectedEvent' })

    stopAudio(this._media.ringAudio)

    if (
      this._callDirection === CallDirectionEnum.OUTBOUND &&
      this._hangupByCurrentAgent === false
    ) {
      this._media.errorAudio.play()
    }
  }

  private acceptedHandler(response: IncomingResponse): void {
    console.warn('response on acceptedHandler()', response)

    const message = response.message

    stopAudio(this._media.ringAudio)

    this.emit(SessionStatus.ACCEPTED)

    if (message.statusCode === 200) {
      callRecording({
        callId: this._callId,
        agentId: this._agentId,
        action: RecordingActionEnum.REC_STATUS,
        accessToken: this._accessToken,
      })
        .then(() => {
          this._recordingFeatureActivated = true
        })
        .catch(() => {
          this._recordingFeatureActivated = false
        })
    } else {
      console.error(
        'Unexpected response on accepted session listener, response:',
        response
      )
    }
  }

  private progressHandler(response: IncomingResponse): void {
    console.warn('--- Call in progress response', response)

    const message = response.message

    if (message.callId) {
      this._callId = message.callId
    }

    if (message.statusCode) {
      if (message.statusCode === 100) {
        // * Previously we had a connecting status
        // this.emit(SessionStatus.CONNECTING)
      }

      if (message.statusCode === 183 || message.statusCode === 180) {
        this.emit(SessionStatus.RINGING)
      }

      // * FIXME: not working
      // if (message.statusCode === 400) {
      //   this.emit(SessionStatus.FAILED, {
      //     origin: 'failedEvent',
      //     reason: 'Invalid destination of transference',
      //   })
      //   this._media.errorAudio.play().then(console.log)
      // }

      if (message.statusCode === 180) {
        try {
          const internalErrorCode = message.getHeader('X-Error-Code')

          if (internalErrorCode !== undefined && internalErrorCode === '998') {
            // simultaneous usage of agents
            this.emit(SessionStatus.FAILED)
          }
        } catch (e) {
          console.error(e)
        }
      }
      /**
       * SDK-26 - On a invite response a rejected transfer by other agent or maybe group
       * the @param response is different, and we have to parse the string the get
       * the incoming session data
       */
    } else {
      console.warn('call in progress response is a different type:', response)
    }
  }

  private setupSessionDescriptionHandlerListeners(
    sessionDescriptionHandler: Web.SessionDescriptionHandler
  ): void {
    sessionDescriptionHandler.on('userMedia', (stream) => {
      // TODO: do something
    })

    sessionDescriptionHandler.on('userMediaRequest', (constraints) => {
      this.emit('userMediaRequest', constraints)
    })

    sessionDescriptionHandler.on('userMediaFailed', (error) => {
      this.emit('userMediaFailed', error)
    })

    sessionDescriptionHandler.on('addTrack', (track) => {
      this.emit('addTrack', track)
    })
  }

  private cleanupMedia(): void {
    console.warn('-- media clean up')

    this._media.remoteSource.srcObject = null
    this._media.remoteSource.pause()
    this._media.localSource.srcObject = null
    this._media.localSource.pause()
  }

  /**
   * Send DTMF.
   * @remarks
   * Send an INFO request with content type application/dtmf-relay.
   * @param tone - Tone to send.
   */
  public processDTMF(tone: string): Promise<void> {
    console.log(`[${this._callId}] sending DTMF...`)

    // Validate tone
    if (!/^[0-9A-D#*,]$/.exec(tone)) {
      return Promise.reject(new Error('Invalid DTMF tone.'))
    }

    if (!this._currentSession) {
      return Promise.reject(new Error('Session does not exist.'))
    }

    console.log(`[${this._callId}] Sending DTMF tone: ${tone}`)

    const toneAudio = new Audio(defatulDTMFAudio[tone])

    toneAudio.play().then(() => {
      console.log('successfully play DTMF tone', tone)
    })

    const dtmf = tone
    const duration = 100
    const body = {
      contentDisposition: 'render',
      contentType: 'application/dtmf-relay',
      content: 'Signal=' + dtmf + '\r\nDuration=' + duration,
    }
    const requestOptions = { body }

    return this._currentSession.info({ requestOptions }).then(() => {
      return
    })
  }

  public getConnection(): IGetConnection {
    if (this._peerConnection && this._localStream) {
      return {
        pc: this._peerConnection,
        localStream: this._localStream,
      }
    } else return null
  }

  public mute(): void {
    try {
      this._senderEnabled = !this._senderEnabled

      this._peerConnection.getSenders().forEach((stream: RTCRtpSender) => {
        stream.track.enabled = this._senderEnabled
      })

      if (this._senderEnabled) {
        this.emit(SessionStatus.UNMUTED)
      } else {
        this.emit(SessionStatus.MUTED)
      }
    } catch (err) {
      console.error(err)
    }
  }

  public async hold(): Promise<void> {
    let action: HoldActionEnum = HoldActionEnum.HOLD

    try {
      if (this._hold) {
        action = HoldActionEnum.UNHOLD
      }

      const response = await holdCall({
        callId: this._callId,
        agentId: this._agentId,
        action,
        accessToken: this._accessToken,
      })

      if (response.success) {
        this._hold = !this._hold

        if (action === HoldActionEnum.HOLD) {
          this.emit(SessionStatus.HOLD)
        }

        if (action === HoldActionEnum.UNHOLD) {
          this.emit(SessionStatus.UNHOLD)
        }
      }
    } catch (err) {
      console.error(`Error at hold action, type: ${action}`, err)
      throw new Error('Error at hold action')
    }
  }

  public async record(): Promise<void> {
    try {
      if (this._recordingFeatureActivated) {
        let action: RecordingActionEnum = RecordingActionEnum.REC_PAUSE

        if (this._recording) {
          action = RecordingActionEnum.REC_PAUSE
        } else {
          action = RecordingActionEnum.REC_CONTINUE
        }

        const response = await callRecording({
          callId: this._callId,
          agentId: this._agentId,
          action,
          accessToken: this._accessToken,
        })

        if (response.success) {
          this._recording = !this._recording

          if (action === RecordingActionEnum.REC_PAUSE) {
            this.emit(SessionStatus.NOT_RECORDING)
          }

          if (action === RecordingActionEnum.REC_CONTINUE) {
            this.emit(SessionStatus.RECORDING)
          }
        } else {
          throw new Error('Unexpected behaviour at call recording action.')
        }
      } else {
        throw new Error('Agent is not authorized to perform this action.')
      }
    } catch (err) {
      console.error('Error at hold action', err)
      throw new Error(err)
    }
  }

  public endCall(): void {
    if (this._established) {
      this._currentSession.bye()
    } else {
      /**
       * This is in a outgoing not already established call
       */
      this._hangupByCurrentAgent = true

      if (this._callDirection === CallDirectionEnum.OUTBOUND) {
        const incomingSession = this._currentSession as Inviter

        incomingSession.cancel().catch((err) => {
          console.error('Error on cancel inviter', err)
          // TODO: maybe we can trying again to reject
          console.warn('Maybe we can try once again...')
        })
        /**
         * This case applies for incoming invitation
         * we need to use .reject() from Invitation
         */
      } else {
        const incomingSession = this._currentSession as Invitation

        incomingSession
          .reject()
          .then(() => {
            this.emit(SessionStatus.REJECTED, { origin: 'rejectedInvitation' })
          })
          .catch((err) => {
            console.error('Error on reject invitation for some reason', err)
            // TODO: maybe we can trying again to reject
            console.warn('Maybe we can try once again...')
          })
      }
    }

    if (this._localStream && this._localStream.getTracks.length) {
      // * preventing stream to stay open
      this._localStream.getTracks().forEach((track) => {
        track.stop()
      })
    }

    if (this._callDirection === CallDirectionEnum.OUTBOUND) {
      stopAudio(this._media.ringAudio)
    } else {
      // TODO: stop ringing audio
    }
  }

  public acceptCall(): void {
    if (this._callDirection === CallDirectionEnum.INBOUND) {
      const incomingSession = this._currentSession as Invitation
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

      const options: InvitationAcceptOptions = {
        sessionDescriptionHandlerOptions: {
          constraints: constrainsDefault,
        },
      }

      incomingSession.accept(options)
    } else {
      console.error(
        `.acceptCall() is valid for ${CallDirectionEnum.OUTBOUND} calls`
      )
    }
  }

  public makeTransfer({
    type,
    destination,
    option = TransferOptionsEnum.BLIND,
  }: {
    type: TransferEnum
    destination: string
    option?: TransferOptionsEnum
  }): void {
    const extraHeaders = [
      `X-Referred-By-Agent: ${this._sipUsername}`,
      `X-Company: ${this._companyId}`,
    ]

    // TODO: maybe we can verify the agent existence
    if (type === TransferEnum.AGENT) {
      extraHeaders.push(`X-Referred-To-Agent: ${destination}`)
    }

    if (type === TransferEnum.GROUP) {
      extraHeaders.push(`X-Referred-To-Group: ${destination}`)
    }

    if (type === TransferEnum.NUMBER) {
      extraHeaders.push(`X-Referred-To-Number: outbound${destination}`)
    }

    if (option === TransferOptionsEnum.WARM) {
      extraHeaders.push(`X-Warm: yes`)
    }

    const generatedId = Math.floor(Math.random() * 100000) + 1

    const options: SessionReferOptions['requestOptions'] = {
      extraHeaders,
    }

    const transferCallURI = UserAgent.makeURI(
      `sip:transfer-conf-${generatedId}@app.toky.co;transport=TCP;agent`
    )

    if (!transferCallURI) {
      throw new Error('Failed to create transfer call uri.')
    }

    const transferContext = this._currentSession.refer(transferCallURI, {
      requestOptions: options,
      requestDelegate: {
        onAccept: (response: IncomingResponse): void => {
          const message = response.message

          if (
            message.statusCode === 202 &&
            message.reasonPhrase === 'Accepted'
          ) {
            console.log('--- transfer accepted by toky server', response)

            this._currentSession.stateChange.removeListener(
              this.sessionStateListener.bind(this)
            )

            if (option === TransferOptionsEnum.WARM) {
              this._wantToWarmTransfer = true
            }

            callDetails({
              agentId: this._agentId,
              callId: this._callId,
              accessToken: this._accessToken,
            })
              .then((data) => {
                if (data.result && data.result.cdr) {
                  this.emit(SessionStatus.TRANSFER_ACCEPTED, {
                    callData: {
                      direction: data.result.cdr.direction,
                      duration: data.result.cdr.duration,
                      timeOfCall: data.result.cdr.start_dt,
                      transferredCallId: data.result.cdr.child_call
                        ? data.result.cdr.child_call.callid
                        : null,
                    },
                  })
                }
              })
              .catch((err) => {
                console.error('Call Info is no available', err)
                this.emit(SessionStatus.TRANSFER_ACCEPTED, {
                  callData: undefined,
                })
              })
          } else {
            console.warn('status code', message.statusCode)
            console.warn('reason phrase', message.reasonPhrase)

            this.emit(SessionStatus.TRANSFER_FAILED, {
              statusCode: message.statusCode,
              reasonPhrase: message.reasonPhrase,
            })

            console.error(
              'This is not happening, server response does not match expected'
            )
          }
        },
        onReject: (response: IncomingResponse): void => {
          const message = response.message

          if (message.statusCode === 400) {
            console.log('--- transfer rejected by toky server', response)

            console.error('Invalid destination of transfer.')
          }

          this.emit(SessionStatus.TRANSFER_FAILED, {
            statusCode: message.statusCode,
            reasonPhrase: message.reasonPhrase,
          })
        },
      },
    })

    transferContext
      .then((response: OutgoingReferRequest) => {
        console.warn('--- transfer accepted by transport ', response)
      })
      .catch((err) => {
        console.error('Transfer failed for some reason', err)
      })
  }
}
