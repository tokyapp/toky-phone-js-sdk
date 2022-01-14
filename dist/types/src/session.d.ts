/// <reference types="node" />
import { EventEmitter } from 'events';
import { Session } from 'sip.js';
import { Channel } from 'pusher-js';
import { ISource, ISession, ISettings, ICallData, IGetConnection } from './interfaces';
import { CallDirectionEnum, TransferOptionsEnum, TransferEnum } from './constants';
export declare class SessionUA extends EventEmitter implements ISession {
    private _callId;
    private _peerConnection;
    private _currentSession;
    private _media;
    private _localStream;
    private _senderEnabled;
    private _isConnected;
    private _hold;
    private _accessToken;
    private _sipUsername;
    private _agentId;
    private _companyId;
    private _callDirection;
    /**
     * _recordingFeatureActivated
     * Refers to the Agents ability to pause Session recording
     */
    private _recordingFeatureActivated;
    /**
     * _sessionBeingRecorded
     * Refers to the Agents settings about calls being recorded
     */
    private _sessionBeingRecorded;
    /**
     * _recording
     * Call state for recording
     */
    private _recording;
    private _established;
    private _callData;
    private _wantToWarmTransfer;
    private _to;
    private _from;
    private _hangupByCurrentAgent;
    private _tokyChannel;
    constructor(session: Session, media: ISource, tokyChannel: Channel, direction: CallDirectionEnum, tokySettings: ISettings, inboundData?: ICallData);
    get callId(): string;
    get callRecordingEnabled(): boolean;
    get to(): any;
    get from(): any;
    get isConnected(): boolean;
    private pusherEventsHandler;
    private sessionStateListener;
    private onRejectHandler;
    private acceptedHandler;
    private progressHandler;
    private setupSessionDescriptionHandlerListeners;
    private cleanupMedia;
    /**
     * Send DTMF.
     * Send an INFO request with content type application/dtmf-relay.
     *
     * @param {string} tone - Tone to send to current session
     * @returns {Promise<void>}
     */
    processDTMF(tone: string): Promise<void>;
    getConnection(): IGetConnection;
    mute(): void;
    hold(): Promise<void>;
    record(): Promise<void>;
    cancelTransfer(): Promise<void>;
    endCall(): void;
    acceptCall(): void;
    makeTransfer({ type, destination, option, }: {
        type: TransferEnum;
        destination: string;
        option?: TransferOptionsEnum;
    }): void;
    refreshAccessToken(accessToken: string): void;
}
//# sourceMappingURL=session.d.ts.map