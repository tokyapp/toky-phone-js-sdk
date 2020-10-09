import axios from 'axios'

const tokyApiUrl = process.env.TOKY_API_URL

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
  recording_change: boolean
  registered_app_name: string
}

interface CallDetailsAPIData {
  cdr: {
    direction: string
    duration: string
    start_dt: string
    child_call: {
      callid: string
    }
  }
}

interface CallRecordingAPIResponse extends APIResponse {
  recording_enabled: boolean
}

interface CallParamsAPIResponse extends APIResponse {
  data: CallParamsAPIData
}

interface CallDetailsAPIResponse extends APIResponse {
  result: CallDetailsAPIData
}

export const getCallParams = ({
  agentId,
  accessToken,
}: {
  agentId: string
  accessToken: string
}): Promise<CallParamsAPIResponse> =>
  axios({
    url: `${tokyApiUrl}/v1/sdk/call/params`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    params: {
      agent_id: agentId,
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
      console.error(error)
      throw new Error(error)
    })

export enum HoldActionEnum {
  HOLD = 'hold',
  UNHOLD = 'unhold',
}

export const holdCall = ({
  callId,
  action,
  agentId,
  accessToken,
}: {
  callId: string
  agentId: string
  action: HoldActionEnum
  accessToken: string
}): Promise<APIResponse> =>
  axios({
    url: `${tokyApiUrl}/v1/sdk/calls/${callId}/${action}`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    params: {
      agent_id: agentId,
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
  agentId,
  action,
  accessToken,
}: {
  callId: string
  agentId: string
  action: RecordingActionEnum
  accessToken: string
}): Promise<CallRecordingAPIResponse | APIResponse> =>
  axios({
    url: `${tokyApiUrl}/v1/sdk/calls/${callId}/${action}`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    params: {
      agent_id: agentId,
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

export const callDetails = ({
  agentId,
  callId,
  accessToken,
}: {
  agentId: string
  callId: string
  accessToken: string
}): Promise<CallDetailsAPIResponse> =>
  axios({
    url: `${tokyApiUrl}/v1/sdk/calls/${callId}`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    params: {
      agent_id: agentId,
    },
  })
    .then((response) => {
      const data: CallDetailsAPIResponse = response.data

      if (data && data.success) {
        return data
      } else {
        throw new Error('Something went wrong on toky service call')
      }
    })
    .catch((error) => {
      console.error(error)
      throw new Error(error)
    })
