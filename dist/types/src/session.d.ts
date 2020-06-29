/// <reference types="node" />
import { EventEmitter } from 'events';
import { Session } from 'sip.js';
import { URI } from 'sip.js/lib/core';
import { IMediaAttribute } from './client';
export interface IGetConnection {
    pc: RTCPeerConnection;
    localStream: MediaStream;
}
export declare enum SessionStatus {
    TRYING = "trying",
    CONNECTING = "connecting",
    RINGING = "ringing",
    ACCEPTED = "accepted",
    REJECTED = "rejected",
    DISCONNECTED = "disconnected",
    HOLD = "hold",
    UNHOLD = "unhold",
    MUTED = "muted",
    UNMUTED = "unmuted",
    RECORDING = "recording",
    NOT_RECORDING = "not_recording",
    FAILED = "failed",
    BYE = "bye"
}
export declare enum TransferEnum {
    AGENT = "agent",
    GROUP = "group",
    NUMBER = "number"
}
export declare enum TransferOptionsEnum {
    BLIND = "blind",
    WARM = "warm"
}
export declare enum CallDirectionEnum {
    INBOUND = "inbound",
    OUTBOUND = "outbound"
}
export declare interface ISessionImpl {
    callId: string;
    pauseRecordingActivated: boolean;
    mute: () => void;
    hold?: () => void;
    record?: () => void;
    endCall: () => void;
    getConnection: () => IGetConnection;
    on: (event: SessionStatus, listener: () => void) => void;
}
interface ICallData {
    /** URI Data can be Agent SIP Username, in an outbound call
     * can be the URI generated for the Invitation
     */
    uri: string | URI;
    /** Type of user involved in the call */
    type: 'agent' | 'anon' | 'contact';
    /**
     * Applicable for outbound calls or maybe inbound calls
     * with phone data
     */
    phone?: string;
    /** Transferred Types Blind or Warm */
    transferredType?: 'blind' | 'warm';
    /** Applicable for Transferred calls, cause by a rejected blind transferred
     * or an Invite from a Warm transferred that requires to establish the call
     * inmediately
     */
    cause?: 'rejected' | 'establish';
}
interface ISettings {
    agentId: string;
    apiKey: string;
    sipUsername: string;
    companyId: string;
}
export declare class SessionUA extends EventEmitter implements ISessionImpl {
    private _callId;
    private _peerConnection;
    private _currentSession;
    private _media;
    private _localStream;
    private _senderEnabled;
    private _hold;
    private _apiKey;
    private _agentId;
    private _sipUsername;
    private _companyId;
    private _callDirection;
    private _recordingFeatureActivated;
    private _recording;
    private _established;
    private _callData;
    private _wantToWarmTransfer;
    private _to;
    private _from;
    constructor(session: Session, media: IMediaAttribute, direction: CallDirectionEnum, tokySettings: ISettings, inboundData?: ICallData);
    get callId(): string;
    get pauseRecordingActivated(): boolean;
    get to(): any;
    get from(): any;
    private sessionStateListener;
    private onRejectHandler;
    private acceptedHandler;
    private progressHandler;
    private setupSessionDescriptionHandlerListeners;
    private cleanupMedia;
    /**
     * Send DTMF.
     * @remarks
     * Send an INFO request with content type application/dtmf-relay.
     * @param tone - Tone to send.
     */
    processDTMF(tone: string): Promise<void>;
    getConnection(): IGetConnection;
    mute(): void;
    hold(): Promise<void>;
    record(): Promise<void>;
    endCall(): void;
    acceptCall(): void;
    makeTransfer({ type, destination, option, }: {
        type: TransferEnum;
        destination: string;
        option?: TransferOptionsEnum;
    }): void;
}
export {};
//# sourceMappingURL=session.d.ts.map