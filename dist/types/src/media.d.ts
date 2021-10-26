/// <reference types="node" />
import { EventEmitter } from 'events';
import { IDeviceList, ISource } from './interfaces';
export declare class MediaSingleton extends EventEmitter {
    _devicesInfoRaw: MediaDeviceInfo[];
    _deviceList: IDeviceList[];
    _localStream: MediaStream;
    _source: ISource;
    hasMediaPermissions: boolean;
    init(): Promise<void>;
    set source(media: ISource);
    get source(): ISource;
    private enumerateDevices;
    private getDeviceList;
    private closeStream;
    private gotStream;
    private gotDevices;
    private handleError;
    get devices(): IDeviceList[];
    get inputs(): IDeviceList[];
    get outputs(): IDeviceList[];
    private getDeviceById;
    private getInputDeviceById;
    private getOutputDeviceById;
    setOutputDevice(id: string): Promise<{
        success: boolean;
        message?: any;
    }>;
    setInputDevice(id: string, connection?: any): Promise<any>;
    get defaultInputDevice(): IDeviceList;
    get defaultOutputDevice(): IDeviceList;
    get selectedInputDevice(): IDeviceList;
    get selectedOutputDevice(): IDeviceList;
}
export declare const Media: MediaSingleton;
//# sourceMappingURL=media.d.ts.map