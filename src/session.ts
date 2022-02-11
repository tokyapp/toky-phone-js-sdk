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

import { Channel } from 'pusher-js'

import { stopAudio, isDevelopment } from './helpers'

import {
  ISource,
  ISession,
  ISettings,
  ICallData,
  IGetConnection,
} from './interfaces'

import {
  CallDirectionEnum,
  SessionStatus,
  TransferOptionsEnum,
  TransferEnum,
  NotRecordingReasons,
} from './constants'

import {
  holdCall,
  callRecording,
  RecordingActionEnum,
  HoldActionEnum,
  callDetails,
  TransferActionEnum,
  cancelTransferAction,
} from './toky-services'

const tokyResourcesUrl = process.env.TOKY_RESOURCES_URL

if (!tokyResourcesUrl) {
  throw new Error('Something went wrong trying to get audio resources url.')
}

const defaultDTMFAudio = {
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

export class SessionUA extends EventEmitter implements ISession {
  private _callId: string
  private _peerConnection: RTCPeerConnection
  private _currentSession: Session | Inviter
  private _media: ISource
  private _localStream: MediaStream
  private _senderEnabled: boolean
  private _isConnected: boolean
  private _hold: boolean
  private _accessToken: string
  private _sipUsername: string
  private _agentId: string
  private _companyId: string
  private _callDirection: CallDirectionEnum
  /**
   * _recordingFeatureActivated
   * Refers to the Agents ability to pause Session recording
   */
  private _recordingFeatureActivated = false
  /**
   * _sessionBeingRecorded
   * Refers to the Agents settings about calls being recorded
   */
  private _sessionBeingRecorded = null
  /**
   * _recording
   * Call state for recording
   */
  private _recording = false
  private _established = false
  private _callData: ICallData
  private _wantToWarmTransfer = false
  private _to = undefined
  private _from = undefined
  private _hangupByCurrentAgent = false
  private _tokyChannel = null

  constructor(
    session: Session,
    media: ISource,
    tokyChannel: Channel,
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
    this._tokyChannel = tokyChannel

    this._hold = false
    this._senderEnabled = true
    this._isConnected = false
    this._recording = false
    this._recordingFeatureActivated = tokySettings.callRecordingEnabled

    this._callDirection = direction

    this._currentSession.stateChange.addListener(
      this.sessionStateListener.bind(this)
    )

    tokyChannel.bind('events', this.pusherEventsHandler.bind(this))
    window.onbeforeunload = (): void => {
      this.endCall()
    }

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
          if (isDevelopment) {
            console.log('Successfully sent INVITE')

            console.log('INVITE request = ', request)
          }
        })
        .catch((error: Error) => {
          if (isDevelopment) console.error('Failed to send INVITE', error)
        })
    }

    if (direction === CallDirectionEnum.INBOUND) {
      const incomingSession = session as Invitation

      this._callId = incomingSession.request.getHeader('Call-ID')
      /**
       * Applied for Warm transfer
       * this case is when the conversation with the agent started
       * and we have to establish the call automatically
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

        incomingSession.accept(options).then(() => {
          callDetails({
            agentId: this._agentId,
            callId: this._callId,
            accessToken: this._accessToken,
          })
            .then((data) => {
              if (data.result?.cdr) {
                const cdr = data.result.cdr

                if (cdr.parent_call?.callid) {
                  const parentCallId = cdr.parent_call.callid
                  const warmTransferData = sessionStorage.getItem(
                    'current_warm_transfer_data'
                  )

                  const transferData = JSON.parse(warmTransferData)

                  if (
                    transferData.callId === parentCallId &&
                    transferData.status === 'REFER'
                  ) {
                    this.emit(SessionStatus.TRANSFER_WARM_INIT, {
                      callId: this._callId,
                      transferType: 'warm',
                      direction: cdr.direction,
                      duration: cdr.duration,
                      timeOfCall: cdr.start_dt,
                      transferredCallId: cdr.child_call?.callid || null,
                    })
                    sessionStorage.setItem(
                      'current_warm_transfer_data',
                      JSON.stringify({
                        ...transferData,
                        inviteCallId: this._callId,
                        status: 'INVITE',
                      })
                    )
                  }

                  if (transferData.muted) {
                    this.mute()
                  }
                }
              }
            })
            .catch((err) => {
              if (isDevelopment) console.error('Call Info is no available', err)
              this.emit(SessionStatus.TRANSFER_WARM_INIT, null)
            })
        })
      }
    }
  }

  get callId(): string {
    return this._callId
  }

  get callRecordingEnabled(): boolean {
    return this._recordingFeatureActivated
  }

  get to(): any {
    return this._to
  }

  get from(): any {
    return this._from
  }

  get isConnected(): boolean {
    return this._isConnected
  }

  private pusherEventsHandler(events: any): void {
    if (events.event === 'call-event') {
      const data = events.data

      if (data.type && data.type === 'call.transfer.update') {
        if (data.is_warm && data.transfer_to_answered) {
          callDetails({
            agentId: this._agentId,
            callId: data.callid,
            accessToken: this._accessToken,
          })
            .then((data) => {
              if (data.result?.cdr) {
                const cdr = data.result.cdr

                if (cdr.parent_call?.callid) {
                  const parentCallId = cdr.parent_call.callid
                  const warmTransferData = sessionStorage.getItem(
                    'current_warm_transfer_data'
                  )

                  const transferData = JSON.parse(warmTransferData)

                  if (
                    transferData.callId === parentCallId &&
                    transferData.status === 'INVITE'
                  ) {
                    this.emit(SessionStatus.TRANSFER_WARM_ANSWERED, {
                      callId: this._callId,
                      transferType: 'warm',
                      direction: cdr.direction,
                      duration: cdr.duration,
                      timeOfCall: cdr.start_dt,
                      transferredCallId: cdr.child_call?.callid || null,
                    })
                    sessionStorage.setItem(
                      'current_warm_transfer_data',
                      JSON.stringify({
                        ...transferData,
                        inviteCallId: this._callId,
                        status: 'ANSWERED',
                      })
                    )
                  }
                }
              }
            })
            .catch((err) => {
              if (isDevelopment) console.error('Call Info is no available', err)
              this.emit(SessionStatus.TRANSFER_WARM_ANSWERED, null)
            })
        }
      }

      /**
       * @remarks
       * This is not invoked since in this point the session is killed already
       * so we're making the request in the .endCall() method (<confirm transfer> action)
       */
      if (data?.type === 'call.transfer.success') {
        if (data.is_warm) {
          callDetails({
            agentId: this._agentId,
            callId: data.callid,
            accessToken: this._accessToken,
          })
            .then((data) => {
              if (data.result?.cdr) {
                const cdr = data.result.cdr

                if (cdr.parent_call?.callid) {
                  const parentCallId = cdr.parent_call.callid
                  const warmTransferData = sessionStorage.getItem(
                    'current_warm_transfer_data'
                  )

                  const transferData = JSON.parse(warmTransferData)

                  if (
                    transferData.callId === parentCallId &&
                    transferData.status === 'INVITE'
                  ) {
                    this.emit(SessionStatus.TRANSFER_WARM_COMPLETED, {
                      callId: this._callId,
                      transferType: 'warm',
                      direction: cdr.direction,
                      duration: cdr.duration,
                      timeOfCall: cdr.start_dt,
                      transferredCallId: cdr.child_call?.callid || null,
                    })
                    sessionStorage.removeItem('current_warm_transfer_data')
                  }
                }
              }
            })
            .catch((err) => {
              if (isDevelopment) console.error('Call Info is no available', err)
              this.emit(SessionStatus.TRANSFER_WARM_COMPLETED, null)
            })
        }
      }

      if (data.type && data.type === 'call.transfer.failure') {
        if (data.is_warm) {
          callDetails({
            agentId: this._agentId,
            callId: data.callid,
            accessToken: this._accessToken,
          })
            .then((data) => {
              if (data.result?.cdr) {
                const cdr = data.result.cdr

                if (cdr.parent_call?.callid) {
                  const parentCallId = cdr.parent_call.callid
                  const warmTransferData = sessionStorage.getItem(
                    'current_warm_transfer_data'
                  )

                  const transferData = JSON.parse(warmTransferData)

                  if (
                    transferData.callId === parentCallId &&
                    transferData.status === 'INVITE'
                  ) {
                    this.emit(SessionStatus.TRANSFER_WARM_NOT_ANSWERED, {
                      callId: this._callId,
                      transferType: 'warm',
                      direction: cdr.direction,
                      duration: cdr.duration,
                      timeOfCall: cdr.start_dt,
                      transferredCallId: cdr.child_call?.callid || null,
                    })

                    sessionStorage.setItem(
                      'current_warm_transfer_data',
                      JSON.stringify({
                        ...transferData,
                        inviteCallId: this._callId,
                        status: 'NOT_ANSWERED',
                      })
                    )
                  }

                  /**
                   * @remarks
                   * This case is when the transferred agent answers the call
                   * but the agent finally do not accept it, so
                   * is ANSWERED but is NOT_COMPLETED
                   */
                  if (
                    transferData.callId === parentCallId &&
                    transferData.status === 'ANSWERED'
                  ) {
                    this.emit(SessionStatus.TRANSFER_WARM_NOT_COMPLETED, {
                      callId: this._callId,
                      transferType: 'warm',
                      direction: cdr.direction,
                      duration: cdr.duration,
                      timeOfCall: cdr.start_dt,
                      transferredCallId: cdr.child_call?.callid || null,
                    })

                    sessionStorage.setItem(
                      'current_warm_transfer_data',
                      JSON.stringify({
                        ...transferData,
                        inviteCallId: this._callId,
                        status: 'NOT_COMPLETED',
                      })
                    )
                  }
                }
              }
            })
            .catch((err) => {
              if (isDevelopment) console.error('Call Info is no available', err)
              // TODO: fix later
              this.emit(SessionStatus.TRANSFER_WARM_NOT_ANSWERED, null)
            })
        }
      }
    }
  }

  private sessionStateListener(newState: SessionState): void {
    switch (newState) {
      case SessionState.Establishing: {
        if (this._callDirection === CallDirectionEnum.OUTBOUND) {
          this._media.ringAudio.play().then(() => {
            if (isDevelopment)
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
            if (isDevelopment)
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
          if (isDevelopment)
            console.warn('-- remote audio played succesfully...')
        })

        if (this._callDirection === CallDirectionEnum.INBOUND) {
          this.emit(SessionStatus.CONNECTED)
          this._isConnected = true
        }

        this._established = true

        if (
          this._callData.type === 'agent' &&
          this._callData.transferredType === undefined
        ) {
          this.emit(SessionStatus.HOLD_NOT_AVAILABLE)
        }

        if (this._callDirection === CallDirectionEnum.INBOUND) {
          this.emit(SessionStatus.RECORDING_NOT_AVAILABLE)
        }

        break
      }
      case SessionState.Terminated: {
        if (isDevelopment)
          console.warn(
            'call direction in terminated event',
            this._callDirection
          )
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

          this._isConnected = false

          if (this._callDirection === CallDirectionEnum.INBOUND)
            stopAudio(this._media.incomingRingAudio)

          this.cleanupMedia()

          this._tokyChannel.unbind()
        }

        break
      }
    }
  }

  private onRejectHandler(response: IncomingResponse): void {
    if (isDevelopment) console.log('reject for some reason', response)
    const message = response.message

    if (
      message.reasonPhrase === 'No credit left' ||
      message.statusCode === 402
    ) {
      if (isDevelopment) console.error('Not credit left')

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
    if (isDevelopment) console.warn('response on acceptedHandler()', response)

    const message = response.message

    stopAudio(this._media.ringAudio)

    this.emit(SessionStatus.CONNECTED)
    this._isConnected = true

    if (message.statusCode === 200) {
      callRecording({
        callId: this._callId,
        agentId: this._agentId,
        action: RecordingActionEnum.REC_STATUS,
        accessToken: this._accessToken,
      })
        .then(() => {
          this.emit(SessionStatus.RECORDING)
          this._sessionBeingRecorded = true
          this._recording = true
        })
        .catch(() => {
          this.emit(SessionStatus.NOT_RECORDING, {
            code: 690,
            reason: NotRecordingReasons.SETTINGS,
          })
          this._sessionBeingRecorded = false
          this._recording = false
        })
    } else {
      if (isDevelopment) {
        console.error(
          'Unexpected response on accepted session listener, response:',
          response
        )
      }
    }
  }

  private progressHandler(response: IncomingResponse): void {
    if (isDevelopment) console.warn('--- Call in progress response', response)

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
          if (isDevelopment) console.error(e)
        }
      }
      /**
       * SDK-26 - On a invite response a rejected transfer by other agent or maybe group
       * the @param response is different, and we have to parse the string the get
       * the incoming session data
       */
    } else {
      if (isDevelopment)
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
    if (isDevelopment) console.warn('-- media clean up')

    this._media.remoteSource.srcObject = null
    this._media.remoteSource.pause()
    this._media.localSource.srcObject = null
    this._media.localSource.pause()
  }

  /**
   * Send DTMF.
   * Send an INFO request with content type application/dtmf-relay.
   *
   * @param {string} tone - Tone to send to current session
   * @returns {Promise<void>}
   */
  public processDTMF(tone: string): Promise<void> {
    if (isDevelopment) console.log(`[${this._callId}] sending DTMF...`)

    // Validate tone
    if (!/^[0-9A-D#*,]$/.exec(tone)) {
      return Promise.reject(new Error('Invalid DTMF tone.'))
    }

    if (!this._currentSession) {
      return Promise.reject(new Error('Session does not exist.'))
    }

    if (isDevelopment)
      console.log(`[${this._callId}] Sending DTMF tone: ${tone}`)

    const toneAudio = new Audio(defaultDTMFAudio[tone])

    toneAudio.play().then(() => {
      if (isDevelopment) console.log('successfully play DTMF tone', tone)
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
      if (isDevelopment) console.error(err)
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
      if (isDevelopment)
        console.error(`Error at hold action, type: ${action}`, err)
      throw new Error('Error at hold action')
    }
  }

  public async record(): Promise<void> {
    try {
      if (this._recordingFeatureActivated && this._sessionBeingRecorded) {
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
            this.emit(SessionStatus.NOT_RECORDING, {
              code: 691,
              reason: NotRecordingReasons.FEATURE,
            })
          }

          if (action === RecordingActionEnum.REC_CONTINUE) {
            this.emit(SessionStatus.RECORDING)
          }
        } else {
          throw new Error('Unexpected behaviour in call recording action.')
        }
      } else {
        throw new Error('Cannot perform this action on current call.')
      }
    } catch (err) {
      if (isDevelopment) console.error('Error at hold action', err)
      throw new Error(err)
    }
  }

  public async cancelTransfer(): Promise<void> {
    try {
      const warmTransferData = sessionStorage.getItem(
        'current_warm_transfer_data'
      )

      if (warmTransferData) {
        const transferData = JSON.parse(warmTransferData)

        if (transferData.callId) {
          const response = await cancelTransferAction({
            callId: transferData.callId,
            agentId: this._agentId,
            action: TransferActionEnum.cancel,
            accessToken: this._accessToken,
          })

          if (response) {
            this.emit(SessionStatus.TRANSFER_WARM_CANCELED)
          }
        } else {
          throw new Error('Parent call id data is not available')
        }
      }
    } catch (err) {
      if (isDevelopment) console.error('Error at cancel_transfer action', err)
      throw new Error(err)
    }
  }

  public endCall(): void {
    if (this._established) {
      if (this._callData.transferredType === TransferOptionsEnum.WARM) {
        callDetails({
          agentId: this._agentId,
          callId: this._callId,
          accessToken: this._accessToken,
        })
          .then((data) => {
            if (data.result?.cdr) {
              const cdr = data.result.cdr

              if (cdr.parent_call?.callid) {
                const parentCallId = cdr.parent_call.callid
                const warmTransferData = sessionStorage.getItem(
                  'current_warm_transfer_data'
                )

                const transferData = JSON.parse(warmTransferData)

                if (
                  transferData.callId === parentCallId &&
                  transferData.status === 'ANSWERED'
                ) {
                  this.emit(SessionStatus.TRANSFER_WARM_COMPLETED, {
                    callId: this._callId,
                    transferType: 'warm',
                    direction: cdr.direction,
                    duration: cdr.duration,
                    timeOfCall: cdr.start_dt,
                    transferredCallId: cdr.child_call?.callid || null,
                  })
                }

                sessionStorage.removeItem('current_warm_transfer_data')
                this._currentSession.bye()
              }
            }
          })
          .catch((err) => {
            if (isDevelopment) console.error('Call Info is no available', err)
            this.emit(SessionStatus.TRANSFER_WARM_COMPLETED, null)
          })
      } else {
        this._currentSession.bye()
      }
    } else {
      /**
       * This is in a outgoing not already established call
       */
      this._hangupByCurrentAgent = true

      if (this._callDirection === CallDirectionEnum.OUTBOUND) {
        const incomingSession = this._currentSession as Inviter

        incomingSession.cancel().catch((err) => {
          if (isDevelopment) {
            console.error('Error on cancel inviter', err)
            // TODO: maybe we can trying again to reject
            console.warn('Maybe we can try once again...')
          }
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
            if (isDevelopment) {
              console.error('Error on reject invitation for some reason', err)
              // TODO: maybe we can trying again to reject
              console.warn('Maybe we can try once again...')
            }
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
      if (isDevelopment) {
        console.error(
          `.acceptCall() is valid for ${CallDirectionEnum.OUTBOUND} calls`
        )
      }
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
      destination = destination.replace('@', '__')
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
            if (isDevelopment)
              console.log('--- transfer accepted by toky server', response)

            this._currentSession.stateChange.removeListener(
              this.sessionStateListener.bind(this)
            )

            this._tokyChannel.unbind()

            if (option === TransferOptionsEnum.WARM) {
              this._wantToWarmTransfer = true
              sessionStorage.setItem(
                'current_warm_transfer_data',
                JSON.stringify({
                  callId: this.callId,
                  muted: !this._senderEnabled,
                  status: 'REFER',
                })
              )
            } else {
              callDetails({
                agentId: this._agentId,
                callId: this._callId,
                accessToken: this._accessToken,
              })
                .then((data) => {
                  const cdr = data.result.cdr
                  if (data.result?.cdr) {
                    this.emit(SessionStatus.TRANSFER_BLIND_INIT, {
                      callId: this._callId,
                      transferType: option,
                      direction: cdr.direction,
                      duration: cdr.duration,
                      timeOfCall: cdr.start_dt,
                      transferredCallId: cdr.child_call?.callid || null,
                    })
                  }
                })
                .catch((err) => {
                  if (isDevelopment)
                    console.error('Call Info is no available', err)
                  this.emit(SessionStatus.TRANSFER_BLIND_INIT, null)
                })
            }
          } else {
            if (isDevelopment) {
              console.warn('status code', message.statusCode)
              console.warn('reason phrase', message.reasonPhrase)
            }

            this.emit(SessionStatus.TRANSFER_FAILED, {
              statusCode: message.statusCode,
              reasonPhrase: message.reasonPhrase,
            })

            if (isDevelopment) {
              console.error(
                'This is not happening, server response does not match expected'
              )
            }
          }
        },
        onReject: (response: IncomingResponse): void => {
          const message = response.message

          if (message.statusCode === 400) {
            if (isDevelopment) {
              console.log('--- transfer rejected by toky server', response)

              console.error('Invalid destination of transfer.')
            }
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
        if (isDevelopment)
          console.warn('--- transfer accepted by transport ', response)
      })
      .catch((err) => {
        if (isDevelopment) console.error('Transfer failed for some reason', err)
      })
  }

  refreshAccessToken(accessToken: string): void {
    this._accessToken = accessToken
  }
}
