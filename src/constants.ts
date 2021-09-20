export enum ClientStatus {
  INVITE = 'invite',
  INVITE_REJECTED = 'invite_rejected',
  REGISTERING = 'registering',
  CONNECTING = 'connecting',
  ONLINE = 'online',
  OFFLINE = 'offline',
  UNREGISTERED = 'unregistered',
  REGISTRATION_FAILED = 'registration_failed',
  REGISTERED = 'registered',
  DEFAULT = 'default',
  READY = 'ready',
  DISCONNECTED = 'disconnected',
  SESSION_UPDATED = 'session_updated',
}

export enum SessionStatus {
  TRYING = 'trying',
  RINGING = 'ringing',
  CONNECTED = 'connected',
  REJECTED = 'rejected',
  HOLD = 'hold',
  UNHOLD = 'unhold',
  HOLD_NOT_AVAILABLE = 'hold_not_available',
  MUTED = 'muted',
  UNMUTED = 'unmuted',
  RECORDING = 'recording',
  NOT_RECORDING = 'not_recording',
  RECORDING_NOT_AVAILABLE = 'recording_not_available',
  /**
   * @remarks
   * TRANSFER_FAILED indicates that the server rejects the transfer for some reason
   * one of the reasons can be, transferred agent doesn't exists
   */
  TRANSFER_FAILED = 'transfer_failed',
  TRANSFER_BLIND_INIT = 'transfer_blind_init',
  TRANSFER_WARM_INIT = 'transfer_warm_init',
  TRANSFER_WARM_ANSWERED = 'transfer_warm_answered',
  TRANSFER_WARM_NOT_ANSWERED = 'transfer_warm_not_answered',
  TRANSFER_WARM_COMPLETED = 'transfer_warm_completed',
  TRANSFER_WARM_NOT_COMPLETED = 'transfer_warm_not_completed',
  TRANSFER_WARM_CANCELED = 'transfer_warm_canceled',
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

export enum NotRecordingReasons {
  FEATURE = 'call-recording-paused',
  SETTINGS = 'outbound-calls-settings',
}

export enum MediaStatus {
  READY = 'ready',
  UPDATED = 'updated',
  ERROR = 'error',
  UNSUPPORTED = 'unsupported',
  PERMISSION_GRANTED = 'permission_granted',
  PERMISSION_REVOKED = 'permission_revoked',
  INPUT_UPDATED = 'input_updated',
  OUTPUT_UPDATED = 'output_updated',
}