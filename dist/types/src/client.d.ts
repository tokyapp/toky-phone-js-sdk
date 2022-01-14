/// <reference types="node" />
import { UserAgent, Session, Registerer, URI } from 'sip.js';
import { Channel } from 'pusher-js';
import { EventEmitter } from 'events';
import { IAccount, IMediaSpec, IIceServer, IClient, IClientSetting } from './interfaces';
import { SessionUA } from './session';
export declare class Client extends EventEmitter implements IClient {
    /** Related to Toky Settings */
    _accessToken: string;
    _account: IAccount;
    _companyId: string;
    _tokyDomain: string;
    _connectionCountry: string;
    _appName: string;
    _tokyIceServers: IIceServer[];
    _tokyChannel: Channel;
    _transportLib: 'sip.js' | 'jsSIP';
    _userAgent: UserAgent;
    _userAgentSession: Session;
    _registerer: Registerer;
    _currentSession: SessionUA;
    _activeSession: boolean;
    /** Related to States */
    acceptInboundCalls: boolean;
    isRegistering: boolean;
    isRegistered: boolean;
    isTransportConnecting: boolean;
    isTransportConnected: boolean;
    _reconnectionAttempts: number;
    _reconnectionDelay: number;
    _attemptingReconnection: boolean;
    _shouldBeConnected: boolean;
    subscription: any;
    serverUri: URI;
    constructor({ accessToken, account, transportLib, media, }: {
        accessToken: string;
        account: IAccount;
        transportLib: 'sip.js' | 'jsSIP';
        media: IMediaSpec;
    });
    /**
     * Toky Client .init() is were we get the Toky Phone Params to establish communication with the Toky Phone System
     *
     * @returns {IClientSetting} - Returns data related to the Agent Settings
     */
    init(): Promise<IClientSetting>;
    /**
     * Handlers for event listeners
     */
    private sessionTerminatedHandler;
    private onInvite;
    private attemptReconnection;
    private onDisconnect;
    private onConnect;
    private register;
    private onOnline;
    private prepateActiveSession;
    private onOffline;
    /**
     * Internal method to build the Toky SIP URI
     *
     * @param {string} phoneNumber - Phone Number to create the Toky SIP URI
     * @returns {URI} - Returns a builded Toky SIP URI
     */
    private outboundCallURI;
    /**
     * Method for Access Token Refresh after expiration
     *
     * @param {string} accessToken - new Access Token provided by Toky API
     *
     * @returns {void}
     */
    refreshAccessToken(accessToken: string): void;
    /**
     * Main Start Call method that establish a call and returns an ISession
     *
     * @param {Object} callData - Object with call data params
     * @param {string} callData.phoneNumber - Phone Number to call
     * @param {string} callData.callerId - Caller Id to use for the call
     */
    startCall({ phoneNumber, callerId, }: {
        phoneNumber: string;
        callerId: string;
    }): void;
}
//# sourceMappingURL=client.d.ts.map