/// <reference types="node" />
import { EventEmitter } from 'events';
export interface HTMLMediaElementExp extends HTMLMediaElement {
    setSinkId: any;
}
export declare class MediaSingleton extends EventEmitter {
    private allDevices;
    private status;
    private requestPermissionPromise;
    private hadPermission;
    private _remoteSource;
    init({ remoteSource }: {
        remoteSource: HTMLMediaElementExp;
    }): void;
    private enumerateDevices;
    private devicesMapping;
    private updateDeviceList;
    private updatePermissions;
    closeStream(stream: MediaStream): void;
    requestPermission(): Promise<void>;
    get defaultDevice(): any;
    get devices(): any;
    get inputs(): any;
    get outputs(): any;
    checkPermission(): Promise<boolean>;
    setOutputDevice(id: string): Promise<any>;
    setInputDevice(id: string, connection?: any): Promise<any>;
}
export declare const Media: MediaSingleton;
//# sourceMappingURL=media.d.ts.map