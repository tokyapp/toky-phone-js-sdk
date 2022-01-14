interface APIResponse {
    success: boolean;
}
export interface IWSServers {
    ws_uri: string;
    weight: number;
}
interface CallParamsAPIData {
    sip: {
        ws_servers: IWSServers[];
        turn_servers: {
            urls: string[];
            username: string;
            password: string;
        };
        stun_servers: string[];
        domain: string;
        register: boolean;
        trace_sip: boolean;
        proxy: string;
        log_level: string;
        uri: string;
        username: string;
        password: string;
        displayName: string;
    };
    is_anon: boolean;
    customer_id: string;
    agent_id: string;
    company_id: string;
    anon_contact_info: boolean;
    connection_country: string;
    referer: string;
    recording_change: boolean;
    registered_app_name: string;
    channel_id: string;
}
interface CallDetailsAPIData {
    cdr: {
        direction: string;
        duration: string;
        start_dt: string;
        child_call: {
            callid: string;
        };
        parent_call?: {
            callid: string;
        };
    };
}
interface CallRecordingAPIResponse extends APIResponse {
    recording_enabled: boolean;
}
interface CallParamsAPIResponse extends APIResponse {
    data: CallParamsAPIData;
}
interface CallDetailsAPIResponse extends APIResponse {
    result: CallDetailsAPIData;
}
export declare const getCallParams: ({ agentId, accessToken, }: {
    agentId: string;
    accessToken: string;
}) => Promise<CallParamsAPIResponse>;
export declare enum HoldActionEnum {
    HOLD = "hold",
    UNHOLD = "unhold"
}
export declare const holdCall: ({ callId, action, agentId, accessToken, }: {
    callId: string;
    agentId: string;
    action: HoldActionEnum;
    accessToken: string;
}) => Promise<APIResponse>;
export declare enum RecordingActionEnum {
    REC_STATUS = "recstatus",
    REC_PAUSE = "recpause",
    REC_CONTINUE = "reccontinue"
}
export declare const callRecording: ({ callId, agentId, action, accessToken, }: {
    callId: string;
    agentId: string;
    action: RecordingActionEnum;
    accessToken: string;
}) => Promise<CallRecordingAPIResponse | APIResponse>;
export declare enum TransferActionEnum {
    cancel = "cancel_transfer"
}
export declare const cancelTransferAction: ({ callId, action, agentId, accessToken, }: {
    callId: string;
    agentId: string;
    action: TransferActionEnum;
    accessToken: string;
}) => Promise<APIResponse>;
export declare const callDetails: ({ agentId, callId, accessToken, }: {
    agentId: string;
    callId: string;
    accessToken: string;
}) => Promise<CallDetailsAPIResponse>;
export {};
//# sourceMappingURL=toky-services.d.ts.map