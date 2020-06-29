/// <reference types="node" />
import { UserAgent, Session, Registerer, URI } from 'sip.js';
import { EventEmitter } from 'events';
import { ISessionImpl } from './session';
export declare enum ClientStatus {
    INVITE = "invite",
    REGISTERING = "registering",
    REGISTRATION_FAILED = "registration_failed",
    REGISTERED = "registered",
    DEFAULT = "default",
    READY = "ready",
    DISCONNECTED = "disconnected"
}
export declare enum MediaStatus {
    READY = "ready",
    UPDATED = "updated",
    ERROR = "error",
    UNSUPPORTED = "unsupported",
    PERMISSION_GRANTED = "permission_granted",
    PERMISSION_REVOKED = "permission_revoked"
}
interface IAccountAttribute {
    /** Agent id registered in Toky */
    user: string;
    /** Type of user that request the service */
    type: 'agent';
    /** App Name displayed in Server */
    name: string;
    /** SIP username in Toky Telephone Service */
    sipUsername?: string;
}
interface IMediaSpec {
    /** Url of the ring audio that would be used */
    ringAudio: string;
    errorAudio: string;
    incomingRingAudio: string;
}
export interface IMediaAttribute {
    /** Url of the ring audio that would be used */
    remoteSource: HTMLAudioElement;
    localSource: HTMLAudioElement;
    ringAudio: HTMLAudioElement;
    errorAudio: HTMLAudioElement;
    incomingRingAudio: HTMLAudioElement;
}
interface IIceServerAttribute {
    urls: string[];
    username?: string;
    credential?: string;
}
interface IDeviceList {
    id: string;
    name: string;
    kind: string;
}
declare interface IClientImpl {
    init: () => Promise<void>;
    register: () => void;
    startCall: (options: {
        phoneNumber: string;
        callerId: string;
    }) => ISessionImpl;
    on: (event: ClientStatus, listener: () => void) => void;
}
export declare class Client extends EventEmitter implements IClientImpl {
    /** Related to Toky Settings */
    _apiKey: string;
    _account: IAccountAttribute;
    _companyId: string;
    _tokyDomain: string;
    _connectionCountry: string;
    _appName: string;
    _tokyIceServers: IIceServerAttribute[];
    _media: IMediaAttribute;
    _transportLib: 'sip.js' | 'jsSIP';
    _userAgent: UserAgent;
    _userAgentSession: Session;
    _registerer: Registerer;
    _localStream: MediaStream;
    _deviceList: IDeviceList[];
    /** Related to States */
    hasMediaPermissions: boolean;
    isRegistering: boolean;
    isRegistered: boolean;
    isTransportConnecting: boolean;
    isTransportConnected: boolean;
    subscription: any;
    serverUri: URI;
    constructor({ apiKey, account, transportLib, media, }: {
        apiKey: string;
        account: IAccountAttribute;
        transportLib: 'sip.js' | 'jsSIP';
        media: IMediaSpec;
    });
    /**
     * Init is where we call the Toky API to get call params
     * and it establish communication with the Toky Server
     */
    init(): Promise<any>;
    /**
     * @remarks
     * Media related methods, now mixed with Client class
     * maybe later can exists in its own class
     */
    private enumerateDevices;
    private getDeviceList;
    private mediaInit;
    private closeStream;
    private gotStream;
    private gotDevices;
    private handleError;
    private outboundCallURI;
    /**
     * Event listeners
     */
    private onNotify;
    private subscribeToTransport;
    /**
     * Handlers for event listeners
     */
    private sessionTerminatedHandler;
    /**
     * PUBLIC METHODS
     */
    get devices(): any;
    get inputs(): any;
    get outputs(): any;
    setOutputDevice(id: string): Promise<{
        success: boolean;
        err?: any;
    }>;
    setInputDevice(id: string, connection?: any): Promise<any>;
    /**
     * In Toky SDK this is done automatically in the constructor
     * with the default register option set in the User Agent (* not anymore)
     */
    register(): void;
    startCall({ phoneNumber, callerId, }: {
        phoneNumber: string;
        callerId: string;
    }): ISessionImpl;
}
export {};
//# sourceMappingURL=client.d.ts.map