import {
  AGENT_ID_KEY,
  AUTH_CODE_KEY,
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  ACCESS_TOKEN_TYPE_KEY,
} from './constants.js'

import {
  checkRequiredValue,
  setItem,
  getItem,
  removeItems,
  getHtmlCollectionAsArray,
} from './utils.js'

/**
 * Info
 */
const infoAppId = document.getElementById('info-app-id')
const infoSsoUrl = document.getElementById('info-sso-url')
const infoApiUrl = document.getElementById('info-api-url')
const infoAgentId = document.getElementById('info-agent-id')
const infoAuthCode = document.getElementById('info-auth-code')
const infoAccessToken = document.getElementById('info-access-token')
const infoRefreshToken = document.getElementById('info-refresh-token')

/**
 * Inputs
 */
const agentIdInput = document.getElementById('agent-id-input')
const callerIdInput = document.getElementById('caller-id-input')
const phoneNumberInput = document.getElementById('phone-number-input')
const transferToInput = document.getElementById('transfer-to-input')
const addNoteInput = document.getElementById('add-note-input')
const addTagInput = document.getElementById('add-tag-input')

/**
 * Selects
 */
const callerIdSelect = document.getElementById('caller-id-select')
const audioInputSelect = document.getElementById('audio-input-select')
const audioOutputSelect = document.getElementById('audio-output-select')
const transferToSelect = document.getElementById('transfer-to-select')
const accessTokenTypeSelect = document.getElementById(
  'access-token-type-select'
)

/**
 * Buttons
 */
const setAgentIdBtn = document.getElementById('set-agent-id-btn')
const getAuthCodeBtn = document.getElementById('get-auth-code-btn')
const getAccessTokenSsoBtn = document.getElementById('get-access-token-sso-btn')
const getAccessTokenAppIdBtn = document.getElementById(
  'get-access-token-app-id-btn'
)
const refreshAccessTokenBtn = document.getElementById(
  'refresh-access-token-btn'
)
const startSdkBtn = document.getElementById('start-sdk-btn')
const startCallBtn = document.getElementById('start-call-btn')
const endCallBtn = document.getElementById('end-call-btn')
const muteBtn = document.getElementById('mute-btn')
const holdBtn = document.getElementById('hold-btn')
const recordBtn = document.getElementById('record-btn')
const makeTransferBtn = document.getElementById('make-transfer-btn')
const cancelTransferBtn = document.getElementById('cancel-transfer-btn')
const completeTransferBtn = document.getElementById('complete-transfer-btn')
const addNoteBtn = document.getElementById('add-note-btn')
const addTagBtn = document.getElementById('add-tag-btn')

/**
 * Labels
 */
const startCallLabel = document.getElementById('start-call-label')
const endCallLabel = document.getElementById('end-call-label')
const muteCallLabel = document.getElementById('mute-call-label')
const holdCallLabel = document.getElementById('hold-call-label')
const recordCallLabel = document.getElementById('record-call-label')

/**
 * Radio
 */
const transferTypeBlind = document.getElementById('transfer-type-blind')
const transferTypeWarm = document.getElementById('transfer-type-warm')

/**
 * Status & description
 */
const clientStatusMessage = document.getElementById('client-status-message')
const clientStatusDesc = document.getElementById('client-status-description')
const microphonePermissionMessage = document.getElementById(
  'microphone-permission-message'
)
const microphonePermissionDesc = document.getElementById(
  'microphone-permission-description'
)
const inputDeviceDesc = document.getElementById('input-device-description')
const outputDeviceDesc = document.getElementById('output-device-description')

/**
 * Misc
 */
const callerIdFriendlyName = document.getElementById('caller-id-friendly-name')
const keypad = getHtmlCollectionAsArray('keypad')
const callOptions = getHtmlCollectionAsArray('call-options')
const transferOptions = getHtmlCollectionAsArray('transfer-options')
const accessTokenSso = document.getElementById('access-token-sso')
const accessTokenAppId = document.getElementById('access-token-app-id')

/**
 * Call details
 */
const outboundCallGroup = document.getElementById('outbound-call-group')
const inboundCallGroup = document.getElementById('inbound-call-group')
const inboundCallDetailsList = document.getElementById(
  'inbound-call-details-list'
)
const callNotesList = document.getElementById('call-notes-list')
const callTagsList = document.getElementById('call-tags-list')

/**
 * Tabs
 */
const callOptionsTabs = document.getElementById('call-options-tabs')

/**
 * Box
 */
const transferBox = document.getElementById('transfer-box')
const notesTagsBox = document.getElementById('notes-tags-box')
const dtfmBox = document.getElementById('dtfm-box')

/**
 * Configuration
 */
const tokyApiUrl = ''
const tokySsoURL = ''

const currentAppId = ''
const currentAppKey = ''

/**
 * Toky Client
 */
const {
  TokyClient,
  TokyMedia,
  ClientStatus,
  SessionStatus,
  TransferEnum,
  TransferOptionsEnum,
  MediaStatus,
} = TokySDK

let tokySession = null
let Client = null

/**
 * Agent ID
 */
function checkAgentId() {
  const agentId = getItem(AGENT_ID_KEY)
  checkRequiredValue(infoAgentId, agentId)
  if (agentId) {
    agentIdInput.value = agentId
    getAuthCodeBtn.disabled = false
    getAccessTokenAppIdBtn.disabled = false
  }
}

function setAgentId() {
  setItem(AGENT_ID_KEY, agentIdInput.value)
  checkAgentId()
}
setAgentIdBtn.addEventListener('click', setAgentId)

/**
 * Authorization Code
 */
function getAuthorizationCode() {
  removeItems([AUTH_CODE_KEY, ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY])

  const agentId = getItem(AGENT_ID_KEY)
  window.location.replace(
    `${tokySsoURL}/auth/sso/login/${currentAppId}?agent_id=${agentId}&redirect_url=${encodeURIComponent(
      window.location.href
    )}`
  )
}
getAuthCodeBtn.addEventListener('click', getAuthorizationCode)

function grabAuthorizationCode() {
  const urlParams = new URLSearchParams(window.location.search)
  let authorizationCode = urlParams.get('code')
  if (!authorizationCode) {
    authorizationCode = getItem(AUTH_CODE_KEY)
  }
  checkRequiredValue(infoAuthCode, authorizationCode)

  if (authorizationCode) {
    setItem(AUTH_CODE_KEY, authorizationCode)
    getAccessTokenSsoBtn.disabled = false
  }
}

/**
 * Access Token
 */
function accessTokenTypeSelection() {
  if (accessTokenTypeSelect.value === 'sso') {
    setItem(ACCESS_TOKEN_TYPE_KEY, 'sso')
    accessTokenSso.style.display = 'block'
    accessTokenAppId.style.display = 'none'
  } else {
    setItem(ACCESS_TOKEN_TYPE_KEY, 'app-id')
    accessTokenSso.style.display = 'none'
    accessTokenAppId.style.display = 'block'
  }
}
accessTokenTypeSelect.addEventListener('change', accessTokenTypeSelection)

function checkAccessToken() {
  const accessTokenType = getItem(ACCESS_TOKEN_TYPE_KEY)
  const accessToken = getItem(ACCESS_TOKEN_KEY)
  const refreshToken = getItem(REFRESH_TOKEN_KEY)

  if (accessTokenType === 'app-id') {
    accessTokenTypeSelect.value = 'app-id'
  } else {
    accessTokenTypeSelect.value = 'sso'
  }
  accessTokenTypeSelection()

  checkRequiredValue(infoAccessToken, accessToken)
  checkRequiredValue(infoRefreshToken, refreshToken)

  if (accessToken && refreshToken) {
    refreshAccessTokenBtn.disabled = false
    startSdkBtn.disabled = false
  }
}

function getAccessTokenSsoMethod() {
  const agentId = getItem(AGENT_ID_KEY)
  const authorizationCode = getItem(AUTH_CODE_KEY)

  /**
   * ref: https://toky-js-sdk.toky.co/reference/access_token
   */
  fetch(`${tokyApiUrl}/v1/access_token`, {
    headers: {
      'X-App-Key': currentAppKey,
    },
    method: 'POST',
    body: JSON.stringify({
      scope: 'dialer',
      agent_id: agentId,
      authorization_code: authorizationCode,
      grant_type: 'code',
    }),
  })
    .then((response) => response.json())
    .then((result) => {
      const accessToken = result.data ? result.data.access_token : ''
      const refreshToken = result.data ? result.data.refresh_token : ''

      setItem(ACCESS_TOKEN_KEY, accessToken)
      setItem(REFRESH_TOKEN_KEY, refreshToken)

      checkAccessToken()
    })
    .catch((err) => console.error(err))
}
getAccessTokenSsoBtn.addEventListener('click', getAccessTokenSsoMethod)

function getAccessTokenAppIdMethod() {
  const agentId = getItem(AGENT_ID_KEY)
  /**
   * ref: https://toky-js-sdk.toky.co/reference/access_token
   */
  fetch(`${tokyApiUrl}/v1/access_token`, {
    headers: {
      'X-App-Key': currentAppKey,
    },
    method: 'POST',
    body: JSON.stringify({
      scope: 'dialer',
      agent_id: agentId,
      app_id: currentAppId,
      grant_type: 'app_id',
    }),
  })
    .then((response) => response.json())
    .then((result) => {
      const accessToken = result.data ? result.data.access_token : ''
      const refreshToken = result.data ? result.data.refresh_token : ''

      setItem(ACCESS_TOKEN_KEY, accessToken)
      setItem(REFRESH_TOKEN_KEY, refreshToken)

      checkRequiredValue(infoAuthCode, '-')

      checkAccessToken()
    })
    .catch((err) => console.error(err))
}
getAccessTokenAppIdBtn.addEventListener('click', getAccessTokenAppIdMethod)

function refreshAccessToken() {
  const refreshToken = getItem(REFRESH_TOKEN_KEY)

  /**
   * ref: https://toky-js-sdk.toky.co/reference/refresh
   */
  fetch(`${tokyApiUrl}/v1/access_token/refresh`, {
    headers: {
      'X-App-Key': currentAppKey,
    },
    method: 'POST',
    body: new URLSearchParams({
      token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
    .then((response) => response.json())
    .then((result) => {
      const newAccessToken = result.data ? result.data.access_token : ''
      const newRefreshToken = result.data ? result.data.refresh_token : ''

      setItem(ACCESS_TOKEN_KEY, newAccessToken)
      setItem(REFRESH_TOKEN_KEY, newRefreshToken)

      if (Client) {
        Client.refreshAccessToken(newAccessToken)
      }

      checkAccessToken()
    })
    .catch((err) => console.error(err))
}
refreshAccessTokenBtn.addEventListener('click', refreshAccessToken)

/**
 * DID Numbers for Agent (Caller ID)
 *
 * @param {Array} didNumbers List of DID numbers for the agent
 */
function createCallerIdOptions(didNumbers) {
  callerIdSelect.options.length = 0

  didNumbers.forEach((didNumber) => {
    const option = document.createElement('option')
    option.value = didNumber.number
    option.text = didNumber.number
    option.setAttribute('data-friendly-name', didNumber.friendly_name)
    callerIdSelect.appendChild(option)
  })

  callerIdSelect.options.selectedIndex = -1
}

async function getDidsForAgent() {
  const agentId = getItem(AGENT_ID_KEY)
  const accessToken = getItem(ACCESS_TOKEN_KEY)

  /**
   * ref: https://toky-js-sdk.toky.co/reference/agentsdids
   */
  fetch(`${tokyApiUrl}/v1/sdk/agents/dids?agent_id=${agentId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
    .then((response) => response.json())
    .then((result) => {
      createCallerIdOptions(result.dids)
    })
    .catch((err) => console.error(err))
}

/**
 * @param {object[]} inputs available Input devices listed by the SDK
 * @param {object[]} outputs available Output devices listed by the SDK
 */
function createDeviceOptions(inputs, outputs) {
  audioInputSelect.options.length = 0
  audioOutputSelect.options.length = 0

  inputs.forEach((device) => {
    const option = document.createElement('option')
    option.value = device.id
    option.text = device.name
    audioInputSelect.appendChild(option)
  })

  outputs.forEach((device) => {
    const option = document.createElement('option')
    option.value = device.id
    option.text = device.name
    audioOutputSelect.appendChild(option)
  })
}

/**
 * Notes
 */
 function createNotesList(notesList) {
  callNotesList.textContent = ''
  if (notesList) {
    notesList.result.forEach((e) => {
      const note = document.createElement('li')
      note.textContent = e._source.content
      callNotesList.appendChild(note)
    })
  }
  addNoteInput.value = ''
}

function getNotes() {
  if (tokySession) {
    const agentId = getItem(AGENT_ID_KEY)
    const accessToken = getItem(ACCESS_TOKEN_KEY)
    const callId = tokySession.callId

    /**
     * ref: https://toky-js-sdk.toky.co/reference/notes
     */
    fetch(`${tokyApiUrl}/v1/sdk/notes?agent_id=${agentId}&call_id=${callId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((response) => response.json())
      .then((result) => {
        createNotesList(result)
      })
      .catch((err) => console.error(err))
  } else {
    console.warn('Error retrieving the notes. No session available.')
  }
}

function createNote(noteValue) {
  if (tokySession) {
    const agentId = getItem(AGENT_ID_KEY)
    const accessToken = getItem(ACCESS_TOKEN_KEY)
    const callId = tokySession.callId

    /**
     * ref: https://toky-js-sdk.toky.co/reference/notes-1
     */
    fetch(`${tokyApiUrl}/v1/sdk/notes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        agent_id: agentId,
        call_id: callId,
        note: noteValue,
      }),
    })
      .then((response) => response.json())
      .then((result) => {
        if (result.success) {
          getNotes()
        }
      })
      .catch((err) => console.error(err))
  } else {
    console.warn('Error adding a note. No session available.')
  }
}

function addNote() {
  const noteValue = addNoteInput.value
  if (noteValue) {
    createNote(noteValue)
  }
}
addNoteBtn.addEventListener('click', addNote)

/**
 * Tags
 */
function createTagsList(tagsList) {
  callTagsList.textContent = ''
  if (tagsList) {
    tagsList.result.forEach((e) => {
      const tag = document.createElement('li')
      tag.textContent = e
      callTagsList.appendChild(tag)
    })
  }
  addTagInput.value = ''
}

function getTags() {
  if (tokySession) {
    const agentId = getItem(AGENT_ID_KEY)
    const accessToken = getItem(ACCESS_TOKEN_KEY)
    const callId = tokySession.callId

    /**
     * ref: https://toky-js-sdk.toky.co/reference/tags
     */
    fetch(`${tokyApiUrl}/v1/sdk/tags?agent_id=${agentId}&call_id=${callId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((response) => response.json())
      .then((result) => {
        createTagsList(result)
      })
      .catch((err) => console.error(err))
  } else {
    console.warn('Error retrieving the tags. No session available.')
  }
}

function createTag(tagValue) {
  if (tokySession) {
    const agentId = getItem(AGENT_ID_KEY)
    const accessToken = getItem(ACCESS_TOKEN_KEY)
    const callId = tokySession.callId

    /**
     * ref: https://toky-js-sdk.toky.co/reference/tags-1
     */
    fetch(`${tokyApiUrl}/v1/sdk/tags`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        agent_id: agentId,
        call_id: callId,
        tag: tagValue,
      }),
    })
      .then((response) => response.json())
      .then((result) => {
        if (result.success) {
          getTags()
        }
      })
      .catch((err) => console.error(err))
  } else {
    console.warn('Error adding a tag. No session available.')
  }
}

function addTag() {
  const tagValue = addTagInput.value
  if (tagValue) {
    createTag(tagValue)
  }
}
addTagBtn.addEventListener('click', addTag)


// Keypad helper function
const keypadDisabled = (disabled) => {
  keypad.forEach((button) => (button.disabled = disabled))
}

const callOptionsDisabled = (disabled) => {
  callOptions.forEach((htmlElement) => (htmlElement.disabled = disabled))
}

const transferOptionsDisabled = (disabled) => {
  transferOptions.forEach((htmlElement) => (htmlElement.disabled = disabled))
  makeTransferBtn.disabled = disabled
  makeTransferBtn.style.display = 'block'
  completeTransferBtn.style.display = 'none'
  if (disabled) {
    makeTransferBtn.classList.remove('is-success')
    cancelTransferBtn.classList.remove('is-danger')
  } else {
    makeTransferBtn.classList.add('is-success')
    cancelTransferBtn.classList.add('is-danger')
  }
}

const notesAndTagsDisabled = (disabled) => {
  addNoteInput.disabled = disabled
  addNoteBtn.disabled = disabled

  addTagInput.disabled = disabled
  addTagBtn.disabled = disabled
}

function transferTypeSelection() {
  transferTypeBlind.checked = false
  transferTypeWarm.checked = false

  if (this === transferTypeBlind) {
    transferTypeBlind.checked = true
  } else {
    transferTypeWarm.checked = true
  }
}
transferTypeBlind.addEventListener('click', transferTypeSelection)
transferTypeWarm.addEventListener('click', transferTypeSelection)

function clearInboundCallDetails() {
  inboundCallDetailsList.textContent = ''
}

function clearNotesAndTags() {
  callNotesList.textContent = ''
  callTagsList.textContent = ''
}

function addInboundCallDetail(id, title, description) {
  let listItem = document.getElementById(id)
  if (!listItem) {
    listItem = document.createElement('li')
    listItem.id = id
  }
  listItem.innerHTML = `<strong>${title}</strong>&nbsp;<span>${description}</span>`
  inboundCallDetailsList.appendChild(listItem)
}

function updateInboundCallDetails(callData) {
  if (callData.remoteUserId) {
    addInboundCallDetail('ic-caller-id', 'Caller ID:', callData.remoteUserId)
  }

  if (callData.remoteUserName) {
    addInboundCallDetail(
      'ic-caller-name',
      'Caller Name:',
      callData.remoteUserName
    )
  }

  if (callData.remoteUserType) {
    addInboundCallDetail('ic-type', 'Caller Type:', callData.remoteUserType)
  }

  if (callData.remoteUserLocation) {
    addInboundCallDetail(
      'ic-location',
      'Location:',
      callData.remoteUserLocation
    )
  }

  if (callData.userAgent) {
    addInboundCallDetail('ic-user-agent', 'User Agent:', callData.userAgent)
  }

  if (callData.remoteUserType === 'contact') {
    const agentId = getItem(AGENT_ID_KEY)
    const accessToken = getItem(ACCESS_TOKEN_KEY)

    const filteredNumber = callData.remoteUserId.replace(/[^0-9]+/g, '')

    fetch(
      `${tokyApiUrl}/v1/sdk/contacts/${filteredNumber}?agent_id=${agentId}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )
      .then((response) => response.json())
      .then((result) => {
        addInboundCallDetail(
          'ic-contact-name',
          'Contact name:',
          result.data[0].name
        )
      })
      .catch((err) => console.error(err))
  }

  if (callData.ivrId) {
    const agentId = getItem(AGENT_ID_KEY)
    const accessToken = getItem(ACCESS_TOKEN_KEY)

    fetch(`${tokyApiUrl}/v1/sdk/ivr/${callData.ivrId}?agent_id=${agentId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((response) => response.json())
      .then((result) => {
        addInboundCallDetail('ic-ivr-name', 'IVR name:', result.ivr.name)
        addInboundCallDetail(
          'ic-ivr-extension',
          'IVR extension:',
          callData.ivrOptionPressed
        )
      })
      .catch((err) => console.error(err))
  }

  if (callData.transferredType) {
    addInboundCallDetail(
      'ic-transferred-type',
      'Transferred type:',
      callData.transferredType
    )

    addInboundCallDetail(
      'ic-transferred-by',
      'Transferred by:',
      callData.transferredBy
    )
  }
}

/**
 * Toky Session Event Listeners
 *
 * @param {tokySession} currentSession Current Toky Session
 */
function setupTokySessionEventListeners(currentSession) {
  tokySession = currentSession
  console.warn('tokySession', tokySession)

  currentSession.on(SessionStatus.CONNECTED, () => {
    clientStatusDesc.textContent = 'In call'

    recordCallLabel.textContent = 'Pause Rec'

    endCallLabel.textContent = 'End Call'
    endCallBtn.disabled = false

    startCallLabel.textContent = 'Start Call'
    startCallBtn.disabled = true

    keypadDisabled(false)
    callOptionsDisabled(false)
    transferOptionsDisabled(false)
    notesAndTagsDisabled(false)
  })

  currentSession.on(SessionStatus.RINGING, () => {
    clientStatusDesc.textContent = 'Ringing'
    endCallBtn.disabled = false
  })

  currentSession.on(SessionStatus.FAILED, () => {
    console.error('-- connection failed')
  })

  currentSession.on(SessionStatus.BYE, () => {
    console.warn('-- call ended:', SessionStatus.BYE)

    // * We recommend you to remove the instance of your session after the call
    tokySession = null
    currentSession = null

    recordCallLabel.textContent = 'Record'

    endCallLabel.textContent = 'End Call'
    endCallBtn.disabled = true

    startCallLabel.textContent = 'Start Call'
    startCallBtn.disabled = false

    muteCallLabel.textContent = 'Mute'
    holdCallLabel.textContent = 'Hold'
    recordCallLabel.textContent = 'Record'

    muteBtn.classList.remove('is-info')
    holdBtn.classList.remove('is-info')
    recordBtn.classList.remove('is-info')

    cancelTransferBtn.disabled = true
    cancelTransferBtn.classList.remove('is-error')

    outboundCallGroup.style.display = 'block'
    inboundCallGroup.style.display = 'none'

    clearInboundCallDetails()
    clearNotesAndTags()

    keypadDisabled(true)
    callOptionsDisabled(true)
    transferOptionsDisabled(true)
    notesAndTagsDisabled(true)
  })

  currentSession.on(SessionStatus.REJECTED, () => {
    console.warn('-- call rejected:', SessionStatus.REJECTED)

    // * We recommend you to remove the instance of your session after the call
    tokySession = null
    currentSession = null

    recordCallLabel.textContent = 'Record'

    outboundCallGroup.style.display = 'block'
    inboundCallGroup.style.display = 'none'

    clearInboundCallDetails()

    keypadDisabled(true)
    callOptionsDisabled(true)
    transferOptionsDisabled(true)
  })

  currentSession.on(SessionStatus.MUTED, () => {
    muteCallLabel.innerText = 'Unmute'
    muteBtn.classList.add('is-info')
  })

  currentSession.on(SessionStatus.UNMUTED, () => {
    muteCallLabel.innerText = 'Mute'
    muteBtn.classList.remove('is-info')
  })

  currentSession.on(SessionStatus.HOLD, () => {
    holdCallLabel.innerText = 'Unhold'
    holdBtn.classList.add('is-info')
  })

  currentSession.on(SessionStatus.UNHOLD, () => {
    holdCallLabel.innerText = 'Hold'
    holdBtn.classList.remove('is-info')
  })

  currentSession.on(SessionStatus.HOLD_NOT_AVAILABLE, () => {
    holdBtn.disabled = true
  })

  currentSession.on(SessionStatus.RECORDING, () => {
    recordCallLabel.innerText = 'Pause Rec'
    recordBtn.classList.add('is-info')
  })

  currentSession.on(SessionStatus.NOT_RECORDING, (data) => {
    if (data.reason === 'outbound-calls-settings') {
      recordBtn.disabled = true
    } else {
      recordCallLabel.innerText = 'Record'
    }
    recordBtn.classList.remove('is-info')
  })

  currentSession.on(SessionStatus.RECORDING_NOT_AVAILABLE, () => {
    recordBtn.disabled = true
    recordCallLabel.textContent = 'Not available'
  })

  currentSession.on(SessionStatus.TRANSFER_BLIND_INIT, (data) => {
    console.warn('--- blind transfer accepted.', data)

    makeTransferBtn.disabled = true
  })

  currentSession.on(SessionStatus.TRANSFER_WARM_INIT, (data) => {
    console.warn('--- warm transfer init.', data)

    endCallBtn.disabled = true
    makeTransferBtn.disabled = true

    cancelTransferBtn.classList.add('is-danger')
    cancelTransferBtn.disabled = false
  })

  currentSession.on(SessionStatus.TRANSFER_WARM_ANSWERED, (data) => {
    console.warn('--- warm transfer answered.', data)

    if (data) {
      makeTransferBtn.style.display = 'none'
      completeTransferBtn.style.display = 'block'
      completeTransferBtn.disabled = false
      completeTransferBtn.classList.add('is-info')

      cancelTransferBtn.disabled = true
    } else {
      transferOptionsDisabled(true)
    }
  })

  currentSession.on(SessionStatus.TRANSFER_WARM_NOT_ANSWERED, (data) => {
    console.warn('--- warm transfer not answered.', data)

    endCallBtn.disabled = false

    makeTransferBtn.disabled = false
    cancelTransferBtn.disabled = true
  })

  currentSession.on(SessionStatus.TRANSFER_WARM_COMPLETED, (data) => {
    console.warn('--- warm transfer completed.', data)

    transferOptionsDisabled(false)
  })

  currentSession.on(SessionStatus.TRANSFER_WARM_NOT_COMPLETED, (data) => {
    console.warn('--- warm transfer not completed.', data)

    cancelTransferBtn.disabled = true
  })

  currentSession.on(SessionStatus.TRANSFER_WARM_CANCELED, () => {
    console.warn('--- warm transfer canceled.')

    endCallBtn.disabled = false

    makeTransferBtn.disabled = false
    cancelTransferBtn.disabled = true
  })

  currentSession.on(SessionStatus.TRANSFER_FAILED, () => {
    console.warn('--- transfer failed.')

    cancelTransferBtn.disabled = true
  })
}

/**
 * Toky Client Event Listeners
 */
function setupTokyClientEventListeners() {
  Client.on(ClientStatus.REGISTERED, () => {
    clientStatusMessage.classList.add('is-warning')
    clientStatusDesc.textContent = 'Registered'

    startCallBtn.classList.add('is-success')
    endCallBtn.classList.add('is-danger')

    startSdkBtn.disabled = true
  })

  Client.on(ClientStatus.CONNECTING, () => {
    clientStatusDesc.textContent = 'Connecting'

    startCallBtn.disabled = true
    endCallBtn.disabled = false
  })

  Client.on(ClientStatus.RECONNECTING, () => {
    clientStatusDesc.textContent = 'Reconnecting'
  })

  Client.on(ClientStatus.SESSION_UPDATED, (data) => {
    setupTokySessionEventListeners(data.session)
  })

  Client.on(ClientStatus.INVITE, (data) => {
    clientStatusDesc.textContent = 'Invite'

    TokyMedia.source.incomingRingAudio.play()

    startCallLabel.textContent = 'Answer Call'
    endCallLabel.textContent = 'Reject Call'

    startCallBtn.disabled = false
    endCallBtn.disabled = false

    updateInboundCallDetails(data.callData)

    outboundCallGroup.style.display = 'none'
    inboundCallGroup.style.display = 'block'
  })

  TokyMedia.on(MediaStatus.READY, () => {
    audioOutputSelect.addEventListener('change', () => {
      TokyMedia.setOutputDevice(audioOutputSelect.value).then(() => {
        console.log('Output device updated successfully!')
      })
    })
    audioInputSelect.addEventListener('change', () => {
      TokyMedia.setInputDevice(audioInputSelect.value).then(() => {
        console.log('Input device updated successfully!')
      })
    })

    createDeviceOptions(TokyMedia.inputs, TokyMedia.outputs)
    inputDeviceDesc.textContent = `${TokyMedia.selectedInputDevice.name}`
    outputDeviceDesc.textContent = `${TokyMedia.selectedOutputDevice.name}`
  })

  TokyMedia.on(MediaStatus.UPDATED, () => {
    createDeviceOptions(TokyMedia.inputs, TokyMedia.outputs)
  })

  TokyMedia.on(MediaStatus.INPUT_UPDATED, () => {
    inputDeviceDesc.textContent = `${TokyMedia.selectedInputDevice.name}`
  })

  TokyMedia.on(MediaStatus.OUTPUT_UPDATED, () => {
    outputDeviceDesc.textContent = `${TokyMedia.selectedOutputDevice.name}`
  })

  TokyMedia.on(MediaStatus.PERMISSION_REVOKED, () => {
    console.error('-- Microphone permission not granted')
    microphonePermissionMessage.classList.add('is-danger')
    microphonePermissionDesc.textContent = 'Permission not granted'
  })

  TokyMedia.on(MediaStatus.PERMISSION_GRANTED, () => {
    console.warn('-- Microphone permission granted')
    microphonePermissionMessage.classList.add('is-success')
    microphonePermissionDesc.textContent = 'Permission granted'
  })
}

function updateCallerIdFriendlyName() {
  const friendlyName =
    this.options[this.selectedIndex].getAttribute('data-friendly-name')
  callerIdFriendlyName.textContent = friendlyName
  callerIdInput.value = this.value
}

function enableStartCallButton() {
  if (callerIdInput.value && phoneNumberInput.value) {
    startCallBtn.disabled = false
  } else {
    startCallBtn.disabled = true
  }
}

/**
 * Enable elements to make calls
 */
function firstRun() {
  callerIdInput.disabled = false
  callerIdSelect.disabled = false
  callerIdSelect.addEventListener('change', updateCallerIdFriendlyName)

  audioInputSelect.disabled = false
  audioOutputSelect.disabled = false

  phoneNumberInput.disabled = false
  phoneNumberInput.addEventListener('input', enableStartCallButton)

  /**
   * Utilities and Event Listeners related to Demo App
   */
  startCallBtn.addEventListener('click', () => {
    if (tokySession) {
      tokySession.acceptCall()
    }

    if (!tokySession) {
      Client.startCall({
        phoneNumber: phoneNumberInput.value,
        callerId: callerIdSelect.value,
      })
    }
  })

  endCallBtn.addEventListener(
    'click',
    () => {
      tokySession.endCall()
    },
    false
  )

  muteBtn.addEventListener('click', () => {
    if (tokySession) {
      tokySession.mute()
    }
  })

  holdBtn.addEventListener('click', () => {
    if (tokySession) {
      tokySession.hold()
    }
  })

  recordBtn.addEventListener('click', () => {
    if (tokySession) {
      tokySession.record()
    }
  })

  makeTransferBtn.addEventListener('click', () => {
    const transferType = transferTypeBlind.checked
      ? TransferOptionsEnum.BLIND
      : TransferOptionsEnum.WARM

    if (tokySession) {
      if (transferToSelect.value === 'agent') {
        tokySession.makeTransfer({
          type: TransferEnum.AGENT,
          destination: transferToInput.value,
          option: transferType,
        })
      }

      if (transferToSelect.value === 'group') {
        tokySession.makeTransfer({
          type: TransferEnum.GROUP,
          destination: transferToInput.value,
          option: transferType,
        })
      }

      if (transferToSelect.value === 'number') {
        tokySession.makeTransfer({
          type: TransferEnum.NUMBER,
          destination: transferToInput.value,
          option: transferType,
        })
      }
    }
  })

  cancelTransferBtn.addEventListener('click', () => {
    if (tokySession) {
      tokySession
        .cancelTransfer()
        .then(() => {
          console.warn('--- CANCEL TRANSFER action success')
        })
        .catch(() => {
          console.warn('--- CANCEL TRANSFER action unsuccess')
        })
    }
  })

  completeTransferBtn.addEventListener('click', () => {
    if (tokySession) {
      tokySession.endCall()
    }
  })

  // Add click listeners to keypad buttons
  keypad.forEach((button) => {
    button.addEventListener('click', () => {
      const tone = button.textContent
      if (tone) {
        tokySession.processDTMF(tone).then(() => {
          console.info('-- succesfully process DTMF')
        })
      }
    })
  })
}

// Select a tab and switch content
callOptionsTabs.querySelectorAll('li > a').forEach((e, i) => {
  e.addEventListener('click', () => {
    transferBox.style.display = 'none'
    notesTagsBox.style.display = 'none'
    dtfmBox.style.display = 'none'

    callOptionsTabs.querySelectorAll('li').forEach(li => li.classList.remove('is-active'))

    switch (i) {
      case 1:
        notesTagsBox.style.display = 'block'
        e.parentElement.classList.add('is-active')
        break

      case 2:
        dtfmBox.style.display = 'block'
        e.parentElement.classList.add('is-active')
        break

      default:
        transferBox.style.display = 'block'
        e.parentElement.classList.add('is-active')
        break
    }
  })
})

/**
 * Toky Client initialization
 */
async function initTokyClient() {
  const agentId = getItem(AGENT_ID_KEY)
  const accessToken = getItem(ACCESS_TOKEN_KEY)

  Client = new TokyClient({
    accessToken: accessToken,
    account: {
      user: agentId,
      type: 'agent',
      acceptInboundCalls: true,
    },
    transportLib: 'sip.js',
  })

  await Client.init()

  setupTokyClientEventListeners()

  firstRun()
}

/**
 * SDK
 */
async function startSdk() {
  await getDidsForAgent()
  await initTokyClient()
}
startSdkBtn.addEventListener('click', startSdk)

/**
 * Main Function
 */
function main() {
  // Check required values to run this example
  checkRequiredValue(infoAppId, currentAppId)
  checkRequiredValue(infoApiUrl, tokyApiUrl)
  checkRequiredValue(infoSsoUrl, tokySsoURL)

  checkAgentId()

  grabAuthorizationCode()

  checkAccessToken()
}

/**
 * Start the App
 */
main()
