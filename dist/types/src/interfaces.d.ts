import { URI } from 'sip.js';
import { SessionStatus, ClientStatus } from './constants';
export interface IAccount {
    /** Agent id registered in Toky */
    user: string;
    type: 'agent';
    sipUsername?: string;
    /** Option to accept inbound calls */
    acceptInboundCalls?: boolean;
    /** Recording permissions */
    callRecordingEnabled: boolean;
}
export interface IClientSetting {
    connectionCountry: string;
    sipUsername: string;
    callRecordingEnabled: boolean;
}
export interface IMediaSpec {
    /** Url of the ring audio that would be used */
    ringAudio: string;
    errorAudio: string;
    incomingRingAudio: string;
}
export interface IIceServer {
    urls: string[];
    username?: string;
    credential?: string;
}
export interface IClient {
    init: () => Promise<{
        connectionCountry: string;
    }>;
    startCall: (options: {
        phoneNumber: string;
        callerId: string;
    }) => void;
    on: (event: ClientStatus, listener: () => void) => void;
}
export interface IGetConnection {
    pc: RTCPeerConnection;
    localStream: MediaStream;
}
export declare interface ISession {
    callId: string;
    callRecordingEnabled: boolean;
    mute: () => void;
    hold?: () => void;
    record?: () => void;
    endCall: () => void;
    getConnection: () => IGetConnection;
    on: (event: SessionStatus, listener: () => void) => void;
}
export interface ICallData {
    /**
     * URI Data can be Agent SIP Username, in an outbound call
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
    /**
     * Applicable for Transferred calls, cause by a rejected blind transferred
     * or an Invite from a Warm transferred that requires to establish the call
     * inmediately
     */
    cause?: 'rejected';
    action?: 'establish';
}
export interface ICallDataEvent {
    remoteUserId: string | URI;
    remoteUserType: 'agent' | 'anon' | 'contact';
    remoteUserLocation?: string;
    remoteUserName?: string;
    did?: string;
    ivrId?: string;
    ivrOptionPressed?: string;
    userAgent?: string;
    transferredType?: 'blind' | 'warm';
    transferredBy?: string;
}
export interface ISettings {
    agentId: string;
    accessToken: string;
    sipUsername: string;
    companyId: string;
    callRecordingEnabled?: boolean;
}
export interface HTMLMediaElementExp extends HTMLMediaElement {
    setSinkId: any;
}
export interface IDeviceList {
    id: string;
    name: string;
    kind: string;
}
export interface ISource {
    /** Url of the ring audio that would be used */
    remoteSource: HTMLAudioElement;
    localSource: HTMLAudioElement;
    ringAudio: HTMLAudioElement;
    errorAudio: HTMLAudioElement;
    incomingRingAudio: HTMLAudioElement;
}
//# sourceMappingURL=interfaces.d.ts.map