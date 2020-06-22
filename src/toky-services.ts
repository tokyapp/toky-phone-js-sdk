import axios from 'axios'

import { isProduction } from './helpers'

const tokyApiUrl = isProduction
  ? process.env.TOKY_API_URL
  : process.env.TOKY_API_URL_DEV

interface APIResponse {
  success: boolean
}

export interface IWSServers {
  ws_uri: string
  weight: number
}

interface CallParamsAPIData {
  sip: {
    ws_servers: IWSServers[]
    turn_servers: {
      urls: string[]
      username: string
      password: string
    }
    stun_servers: string[]
    domain: string
    register: boolean
    trace_sip: boolean
    proxy: string
    log_level: string
    uri: string
    username: string
    password: string
    displayName: string
  }
  is_anon: boolean
  customer_id: string
  agent_id: string
  company_id: string
  anon_contact_info: boolean
  connection_country: string
  referer: string
}

interface CallRecordingAPIResponse extends APIResponse {
  recording_enabled: boolean
}

interface CallParamsAPIResponse extends APIResponse {
  data: CallParamsAPIData
}

export const getCallParams = ({
  agentId,
  apiKey,
}: {
  agentId: string
  apiKey: string
}): Promise<CallParamsAPIResponse> =>
  axios({
    url: `${tokyApiUrl}/v1/widget/call/params`,
    headers: {
      'X-Toky-Key': apiKey,
    },
    params: {
      email: agentId,
    },
  })
    .then((response) => {
      const data: CallParamsAPIResponse = response.data

      if (data && data.success) {
        return response.data
      } else {
        throw new Error('Something went wrong on toky service call')
      }
    })
    .catch((error) => {
      throw new Error(error)
    })

export enum HoldActionEnum {
  HOLD = 'hold',
  UNHOLD = 'unhold',
}

export const holdCall = ({
  callId,
  action,
  apiKey,
  agentId,
}: {
  callId: string
  action: HoldActionEnum
  apiKey: string
  agentId: string
}): Promise<APIResponse> =>
  axios({
    url: `${tokyApiUrl}/v1/calls/by_callid/${callId}/${action}`,
    headers: {
      'x-toky-key': apiKey,
    },
    params: {
      agent: agentId,
    },
  })
    .then((response) => {
      const data: APIResponse = response.data

      if (data && data.success) {
        return response.data
      } else {
        throw new Error('Something went wrong on toky service call')
      }
    })
    .catch((error) => {
      console.error(error)
      throw new Error(error)
    })

export enum RecordingActionEnum {
  REC_STATUS = 'recstatus',
  REC_PAUSE = 'recpause',
  REC_CONTINUE = 'reccontinue',
}

export const callRecording = ({
  callId,
  action,
  apiKey,
  agentId,
}: {
  callId: string
  action: RecordingActionEnum
  apiKey: string
  agentId: string
}): Promise<CallRecordingAPIResponse | APIResponse> =>
  axios({
    url: `${tokyApiUrl}/v1/calls/by_callid/${callId}/${action}`,
    headers: {
      'x-toky-key': apiKey,
    },
    params: {
      agent: agentId,
    },
  })
    .then((response) => {
      if (response.data) {
        const successResponse = response.data.success

        const recordingEnabled = response.data.recording_enabled

        if (
          successResponse &&
          action === RecordingActionEnum.REC_STATUS &&
          recordingEnabled
        ) {
          return response.data
        } else if (
          successResponse &&
          action === RecordingActionEnum.REC_STATUS &&
          !recordingEnabled
        ) {
          throw new Error('Agent is not authorized to perform this action')
        } else if (
          successResponse &&
          (action === RecordingActionEnum.REC_CONTINUE ||
            action === RecordingActionEnum.REC_PAUSE)
        ) {
          return response.data
        } else {
          throw new Error('Something went wrong on toky service call')
        }
      }
    })
    .catch((error) => {
      throw new Error(error)
    })
