import { EventEmitter } from 'events'

import {
  Session,
  Web,
  SessionState,
  InviterInviteOptions,
  Inviter,
} from 'sip.js'

import { stopAudio } from './helpers'

import { IMediaAttribute } from './client'

import {
  holdCall,
  callRecording,
  RecordingActionEnum,
  HoldActionEnum,
} from './toky-services'
import { IncomingResponse } from 'sip.js/lib/core'

export interface IGetConnection {
  pc: RTCPeerConnection
  localStream: MediaStream
}

export enum SessionStatus {
  TRYING = 'trying',
  CONNECTING = 'connecting',
  RINGING = 'ringing',
  ACCEPTED = 'accepted',
  NOT_ACCEPTED = 'not_accepted',
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

export class SessionUA extends EventEmitter implements ISessionImpl {
  private _callId: string
  private _peerConnection: RTCPeerConnection
  private _currentSession: Session | Inviter
  private _media: IMediaAttribute
  private _localStream: MediaStream
  private _senderEnabled: boolean
  private _hold: boolean
  private _apiKey: string
  private _agentId: string
  private _sipUsername: string
  private _companyId: string
  private _callDirection: CallDirectionEnum
  private _recordingFeatureActivated = false
  private _recording = true

  constructor(
    session: Session,
    media: IMediaAttribute,
    direction: CallDirectionEnum,
    tokySettings: {
      agentId: string
      apiKey: string
      sipUsername: string
      companyId: string
    },
    inboundData?: {
      uri: string
      type: 'agent' | 'anon'
      transferredType?: 'blind' | 'warm'
      cause?: 'rejected'
    }
  ) {
    super()

    this._currentSession = session
    this._media = media
    this._apiKey = tokySettings.apiKey
    this._agentId = tokySettings.agentId
    this._sipUsername = tokySettings.sipUsername
    this._companyId = tokySettings.companyId

    this._senderEnabled = true
    this._hold = false
    this._recording = true

    this._callDirection = direction

    this._currentSession.stateChange.addListener((newState: SessionState) => {
      switch (newState) {
        case SessionState.Establishing: {
          this._media.ringAudio.play().then(() => {
            console.warn('... play audio on establishing state')
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

          break
        }
        case SessionState.Established: {
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

          break
        }
        case SessionState.Terminated: {
          // * internal event
          this.emit('__session_terminated')

          this.emit(SessionStatus.BYE, {
            origin: 'terminatedEvent',
          })

          this.cleanupMedia()

          break
        }
      }
    })

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

    this._currentSession
      .invite(inviteOptions)
      .then((request) => {
        console.log('Successfully sent INVITE')
        console.log('INVITE request = ' + request)
      })
      .catch((error: Error) => {
        console.log('Failed to send INVITE', error)
      })

    if (direction === CallDirectionEnum.INBOUND) {
      const incomingSession = session

      // this._callId = incomingSession.request.getHeader('Call-ID')
    }

    this.emit(SessionStatus.CONNECTING)
  }

  get callId(): string {
    return this._callId
  }

  get pauseRecordingActivated(): boolean {
    return this._recordingFeatureActivated
  }

  private onRejectHandler(response): void {
    console.log('reject for some reason', response)
    this.emit(SessionStatus.NOT_ACCEPTED, { origin: 'rejectedEvent' })
  }

  private acceptedHandler(response): void {
    console.warn('response on acceptedHandler()', response)

    stopAudio(this._media.ringAudio)

    this.emit(SessionStatus.ACCEPTED)

    if (response.statusCode === 200) {
      callRecording({
        callId: this._callId,
        action: RecordingActionEnum.REC_STATUS,
        apiKey: this._apiKey,
        agentId: this._agentId,
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

    if (this._callDirection === CallDirectionEnum.INBOUND) {
      if (this._peerConnection.getReceivers().length) {
        const remoteStream = new MediaStream()

        this._peerConnection.getReceivers().forEach((receiver) => {
          if (receiver.track) {
            remoteStream.addTrack(receiver.track)
          }
        })

        this._media.remoteSource.srcObject = remoteStream

        this._media.remoteSource.play().then(() => {
          console.warn('-- remote audio played succesfully...')
        })
      } else {
        console.error('Peer connection has not available receivers.')
      }
    }
  }

  private progressHandler(response: IncomingResponse): void {
    console.warn('--- Call in progress response', response)

    const message = response.message

    if (message.callId) {
      debugger
      this._callId = message.callId
    }

    if (message.statusCode) {
      if (message.statusCode === 100) {
        this.emit(SessionStatus.CONNECTING)
      }

      if (message.statusCode === 183 || message.statusCode === 180) {
        this.emit(SessionStatus.RINGING)
      }

      if (message.statusCode === 183) {
        // Gets remote tracks
        // const remoteStream = new MediaStream()
        // this._peerConnection.getReceivers().forEach((receiver) => {
        //   remoteStream.addTrack(receiver.track)
        // })
        // this._media.remoteSource.srcObject = remoteStream
        // this._media.remoteSource.play().then(console.log)
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
        action,
        apiKey: this._apiKey,
        agentId: this._agentId,
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
          action,
          apiKey: this._apiKey,
          agentId: this._agentId,
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
    this._currentSession.bye()

    // * preventing stream to stay open
    this._localStream.getTracks().forEach((track) => {
      track.stop()
    })

    stopAudio(this._media.ringAudio)
  }

  public acceptCall(): void {
    // if (this._callDirection === CallDirectionEnum.INBOUND) {
    //   const incomingSession = this._currentSession
    //   let constrainsDefault: MediaStreamConstraints = {
    //     audio: true,
    //     video: false,
    //   }
    //   if (typeof Storage !== 'undefined') {
    //     if (sessionStorage.getItem('toky_default_input')) {
    //       const defaultDeviceId = sessionStorage.getItem('toky_default_input')
    //       constrainsDefault = {
    //         audio: { deviceId: defaultDeviceId },
    //         video: false,
    //       }
    //     }
    //   }
    //   const options = {
    //     sessionDescriptionHandlerOptions: {
    //       constraints: constrainsDefault,
    //     },
    //   }
    //   incomingSession.accept(options)
    // } else {
    //   throw new Error(
    //     `.acceptCall() is valid for ${CallDirectionEnum.OUTBOUND} calls`
    //   )
    // }
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
    // const extraHeaders = [
    //   `X-Referred-By-Agent: ${this._sipUsername}`,
    //   `X-Company: ${this._companyId}`,
    // ]
    // // TODO: maybe we can verify the agent existence
    // if (type === TransferEnum.AGENT) {
    //   extraHeaders.push(`X-Referred-To-Agent: ${destination}`)
    // }
    // if (type === TransferEnum.GROUP) {
    //   extraHeaders.push(`X-Referred-To-Group: ${destination}`)
    // }
    // if (type === TransferEnum.NUMBER) {
    //   extraHeaders.push(`X-Referred-To-Number: outbound${destination}`)
    // }
    // if (option === TransferOptionsEnum.WARM) {
    //   extraHeaders.push(`X-Warm: yes`)
    // }
    // const generatedId = Math.floor(Math.random() * 100000) + 1
    // let constrainsDefault: MediaStreamConstraints = {
    //   audio: true,
    //   video: false,
    // }
    // if (typeof Storage !== 'undefined') {
    //   if (sessionStorage.getItem('toky_default_input')) {
    //     const defaultDeviceId = sessionStorage.getItem('toky_default_input')
    //     constrainsDefault = {
    //       audio: { deviceId: defaultDeviceId },
    //       video: false,
    //     }
    //   }
    // }
    // const options = {
    //   extraHeaders,
    //   sessionDescriptionHandlerOptions: {
    //     constraints: constrainsDefault,
    //   },
    // }
    // const transferContext = this._currentSession.refer(
    //   `sip:transfer-conf-${generatedId}@app.toky.co;transport=TCP;agent`,
    //   options
    // )
    // * TODO: we are not getting useful information yet from this event listener
    // transferSession.on(
    //   'referRequestRejected',
    //   (referServerContext: ReferServerContext) => {
    //     console.log('refer sever context', referServerContext)
    //   }
    // )
  }
}
