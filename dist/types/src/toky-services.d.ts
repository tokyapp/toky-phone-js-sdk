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
}
interface CallRecordingAPIResponse extends APIResponse {
    recording_enabled: boolean;
}
interface CallParamsAPIResponse extends APIResponse {
    data: CallParamsAPIData;
}
export declare const getCallParams: ({ agentId, apiKey, }: {
    agentId: string;
    apiKey: string;
}) => Promise<CallParamsAPIResponse>;
export declare enum HoldActionEnum {
    HOLD = "hold",
    UNHOLD = "unhold"
}
export declare const holdCall: ({ callId, action, apiKey, agentId, }: {
    callId: string;
    action: HoldActionEnum;
    apiKey: string;
    agentId: string;
}) => Promise<APIResponse>;
export declare enum RecordingActionEnum {
    REC_STATUS = "recstatus",
    REC_PAUSE = "recpause",
    REC_CONTINUE = "reccontinue"
}
export declare const callRecording: ({ callId, action, apiKey, agentId, }: {
    callId: string;
    action: RecordingActionEnum;
    apiKey: string;
    agentId: string;
}) => Promise<APIResponse | CallRecordingAPIResponse>;
export {};
//# sourceMappingURL=toky-services.d.ts.map