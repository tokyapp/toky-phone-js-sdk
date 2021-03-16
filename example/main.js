import { getButtons } from './demo-utils.js'

const endCallBtn = document.getElementById('endCall')
const startCallBtn = document.getElementById('startCall')

const audioSelectOutput = document.querySelector('select#audioOutput')
const audioSelectInput = document.querySelector('select#audioInput')
const transferType = document.querySelector('select#transferType')
const transferData = document.querySelector('#transferData')
const warmOptionEl = document.querySelector('#warmOption')
const accessToken = document.querySelector('#accessToken')
const agent = document.querySelector('#agent')
const startBtn = document.querySelector('#startBtn')
const muteBtn = document.querySelector('#mute')
const holdBtn = document.querySelector('#hold')
const recordBtn = document.querySelector('#record')
const transferBtn = document.querySelector('#transfer')
const cancelTransferBtn = document.querySelector('#cancelTransfer')
const callStatusTile = document.querySelector('#call-status')
const callStatusSub = document.querySelector('#call-status-sub')
const deviceStatusTile = document.querySelector('#device-status')
const deviceStatusSub = document.querySelector('#device-sub')
const inputDeviceStatusSub = document.querySelector('#input-device-sub')
const outputDeviceStatusSub = document.querySelector('#output-device-sub')
const generalMessage = document.querySelector('#general-message')
const generalArticle = document.querySelector('#general-article')
const phoneNumber = document.querySelector('#phone-number')
const callerIdSelect = document.querySelector('#caller-id')

const keypad = getButtons('keypad')

const tokyApiUrl = 'https://api.toky.co'
const tokySsoURL = 'https://app.toky.co'
/**
 * Insert created app_id from the toky api
 */
const currentAppId = ''

const {
  TokyClient,
  ClientStatus,
  SessionStatus,
  TransferEnum,
  MediaStatus,
} = TokySDK

let tokySession = null
let Client = null

// Keypad helper function
const keypadDisabled = (disabled) => {
  keypad.forEach((button) => (button.disabled = disabled))
}

/**
 * @param {object} currentSession Session established after a call
 */
function setupSessionListeners(currentSession) {
  currentSession.on(SessionStatus.CONNECTED, () => {
    callStatusTile.classList.remove('is-info')
    callStatusTile.classList.add('is-success')
    callStatusSub.textContent = 'In call'

    endCallBtn.textContent = 'End Call'

    muteBtn.disabled = false
    holdBtn.disabled = false
    recordBtn.disabled = false
    transferBtn.disabled = false
    recordBtn.textContent = 'Pause recording'

    keypadDisabled(false)
  })

  currentSession.on(SessionStatus.RINGING, () => {
    callStatusTile.classList.remove('is-warning')
    callStatusTile.classList.add('is-info')
    callStatusSub.textContent = 'Ringing'

    endCallBtn.disabled = false
  })

  currentSession.on(SessionStatus.FAILED, () => {
    console.error('-- connection failed')
  })

  currentSession.on(SessionStatus.BYE, () => {
    console.warn('-- call ended:', SessionStatus.BYE)
    callStatusTile.classList.remove('is-success')

    // * We recommend you to remove the instance of your session after the call
    tokySession = null
    currentSession = null

    muteBtn.disabled = true
    holdBtn.disabled = true
    recordBtn.disabled = true
    endCallBtn.disabled = true
    transferBtn.disabled = true
    cancelTransferBtn.disabled = true
    recordBtn.textContent = 'Record'
  })

  currentSession.on(SessionStatus.REJECTED, () => {
    console.warn('-- call rejected:', SessionStatus.REJECTED)
    callStatusTile.classList.remove('is-success')

    // * We recommend you to remove the instance of your session after the call
    tokySession = null
    currentSession = null

    muteBtn.disabled = true
    holdBtn.disabled = true
    recordBtn.disabled = true
    endCallBtn.disabled = true
    transferBtn.disabled = true
    recordBtn.textContent = 'Record'
  })

  currentSession.on(SessionStatus.MUTED, () => {
    muteBtn.innerText = 'Unmute'
  })

  currentSession.on(SessionStatus.UNMUTED, () => {
    muteBtn.innerText = 'Mute'
  })

  currentSession.on(SessionStatus.HOLD, () => {
    holdBtn.innerText = 'Unhold'
  })

  currentSession.on(SessionStatus.UNHOLD, () => {
    holdBtn.innerText = 'hold'
  })

  currentSession.on(SessionStatus.RECORDING, () => {
    recordBtn.innerText = 'Pause recording'
  })

  currentSession.on(SessionStatus.NOT_RECORDING, (data) => {
    if (data.reason === 'outbound-calls-settings') {
      recordBtn.disabled = true
    } else {
      recordBtn.innerText = 'Record call'
    }
  })

  currentSession.on(SessionStatus.TRANSFER_BLIND_INIT, (data) => {
    console.warn('--- blind transfer accepted.', data)
  })

  currentSession.on(SessionStatus.TRANSFER_WARM_INIT, (data) => {
    console.warn('--- warm transfer init.', data)
    cancelTransferBtn.classList.add('is-danger')
    cancelTransferBtn.disabled = false
  })

  currentSession.on(SessionStatus.TRANSFER_WARM_ANSWERED, (data) => {
    console.warn('--- warm transfer answered.', data)
  })

  currentSession.on(SessionStatus.TRANSFER_WARM_NOT_ANSWERED, (data) => {
    console.warn('--- warm transfer not answered.', data)
  })

  currentSession.on(SessionStatus.TRANSFER_WARM_COMPLETED, (data) => {
    console.warn('--- warm transfer completed.', data)
  })

  currentSession.on(SessionStatus.TRANSFER_WARM_NOT_COMPLETED, (data) => {
    console.warn('--- warm transfer not completed.', data)
  })

  currentSession.on(SessionStatus.TRANSFER_WARM_CANCELED, () => {
    cancelTransferBtn.disabled = false
    cancelTransferBtn.classList.remove('is-danger')
    console.warn('--- warm transfer canceled.')
  })

  currentSession.on(SessionStatus.TRANSFER_FAILED, () => {
    console.warn('--- transfer failed.')
  })
}

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

/**
 * @param {object[]} inputs available Input devices listed by the SDK
 * @param {object[]} outputs available Output devices listed by the SDK
 */
function createDeviceOptions(inputs, outputs) {
  audioSelectOutput.options.length = 0
  audioSelectInput.options.length = 0

  inputs.forEach((device) => {
    const option = document.createElement('option')
    option.value = device.id
    option.text = device.name
    audioSelectInput.appendChild(option)
  })

  outputs.forEach((device) => {
    const option = document.createElement('option')
    option.value = device.id
    option.text = device.name
    audioSelectOutput.appendChild(option)
  })
}

/**
 * @param callerIds
 */
function createCallerIdOption(callerIds) {
  callerIdSelect.options.length = 0

  callerIds.forEach((callerId) => {
    const option = document.createElement('option')
    option.value = callerId.number
    option.text = callerId.number
    callerIdSelect.appendChild(option)
  })
}

/**
 * Main method when the example starts
 *
 * @returns {void}
 */
async function main() {
  const urlParams = new URLSearchParams(window.location.search)
  const authorizationCode = urlParams.get('code')
  const agentId = urlParams.get('agent_id')

  let transferTypeSelected = transferType.value
  let warmOption = false

  if (authorizationCode) {
    if (!agentId) {
      generalMessage.textContent =
        'agent_id query param is required to run the example app'
      generalArticle.classList.add('is-danger')
      return
    }

    /**
     * ref: https://toky-js-sdk.toky.co/reference#access_token
     */
    fetch(`${tokyApiUrl}/v1/access_token`, {
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
        accessToken.value = result.data ? result.data.access_token : ''
        agent.value = agentId
        generalMessage.textContent = 'Status: Code authorization granted'

        startBtn.addEventListener('click', async () => {
          fetch(`${tokyApiUrl}/v1/sdk/agents/dids?agent_id=${agent.value}`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${accessToken.value}` },
          })
            .then((response) => response.json())
            .then((result) => {
              createCallerIdOption(result.dids)
            })
            .catch((err) => console.error(err))

          Client = new TokyClient({
            accessToken: accessToken.value,
            account: {
              user: agentId,
              type: 'agent',
            },
            transportLib: 'sip.js',
          })

          await Client.init()

          startCallBtn.disabled = false

          Client.on(ClientStatus.REGISTERED, () => {
            startBtn.style.pointerEvents = 'none'
            startBtn.style.cursor = 'default'
            startBtn.classList.remove('is-success')

            callStatusTile.classList.add('is-warning')
            callStatusSub.textContent = 'Registered'

            startCallBtn.classList.add('is-success')
            startCallBtn.textContent = 'Start Call'
            endCallBtn.classList.add('is-danger')
            endCallBtn.textContent = 'End Call'

            muteBtn.classList.add('is-light')
          })

          Client.on(ClientStatus.CONNECTING, () => {
            callStatusSub.textContent = 'Connecting'

            endCallBtn.disabled = false
          })

          Client.on(ClientStatus.RECONNECTING, () => {
            callStatusSub.textContent = 'Reconnecting'
          })

          Client.on(ClientStatus.INVITE, (data) => {
            const incomingSession = data.session
            console.log('incomingSession', incomingSession)

            startCallBtn.textContent = 'Answer Call'
            endCallBtn.textContent = 'Reject Call'

            endCallBtn.disabled = false

            tokySession = incomingSession
            setupSessionListeners(tokySession)
          })

          Client.on(MediaStatus.READY, () => {
            audioSelectOutput.addEventListener('change', () => {
              Client.setOutputDevice(audioSelectOutput.value).then(() => {
                console.log('Output device updated successfully!')
              })
            })

            audioSelectInput.addEventListener('change', () => {
              const inputSelected = audioSelectInput.value
              if (tokySession) {
                const connection = tokySession.getConnection()
                Client.setInputDevice(inputSelected, connection).then(() => {
                  console.log('Input device updated successfully!')
                })
              } else {
                Client.setInputDevice(inputSelected).then(() => {
                  console.log('Input device updated successfully!')
                })
              }
            })

            createDeviceOptions(Client.inputs, Client.outputs)

            inputDeviceStatusSub.textContent = `Selected input: ${Client.selectedInputDevice.name}`
            outputDeviceStatusSub.textContent = `Selected ouput: ${Client.selectedOutputDevice.name}`
          })

          Client.on(MediaStatus.UPDATED, () => {
            createDeviceOptions(Client.inputs, Client.outputs)
          })

          Client.on(MediaStatus.INPUT_UPDATED, () => {
            inputDeviceStatusSub.textContent = `Selected input: ${Client.selectedInputDevice.name}`
          })

          Client.on(MediaStatus.OUTPUT_UPDATED, () => {
            outputDeviceStatusSub.textContent = `Selected ouput: ${Client.selectedOutputDevice.name}`
          })

          Client.on(MediaStatus.PERMISSION_REVOKED, () => {
            console.error('-- Microphone permission not granted')
            deviceStatusTile.classList.add('is-danger')
            deviceStatusSub.textContent = 'Permission not granted'
          })

          Client.on(MediaStatus.PERMISSION_GRANTED, () => {
            console.warn('-- Microphone permission granted')
            deviceStatusTile.classList.add('is-primary')
            deviceStatusSub.textContent = 'Permission granted'
          })
        })
      })
      .catch((error) => {
        console.log('error', error)
      })
  } else {
    /**
     * REDIRECT BEGIN
     * ref: https://toky-js-sdk.toky.co/docs/single-sign-on
     */
    if (!currentAppId) {
      generalMessage.textContent =
        'app_id has to be provided in the main.js example file, contact Toky support for more details'
      generalArticle.classList.add('is-danger')
      return
    }
    window.location.replace(
      `${tokySsoURL}/auth/sso/login/${currentAppId}?redirect_url=${encodeURIComponent(
        window.location.href
      )}`
    )
  }

  /**
   * Utilities and Event Listeners related to Demo App
   */

  transferType.addEventListener('change', () => {
    console.log('selected value', transferType.value)
    transferTypeSelected = transferType.value
  })

  warmOptionEl.addEventListener('change', () => {
    console.log('warm option updated')
    warmOption = !warmOption
  })

  startCallBtn.addEventListener('click', () => {
    if (tokySession) {
      tokySession.acceptCall()
    }

    if (!tokySession) {
      tokySession = Client.startCall({
        phoneNumber: phoneNumber.value,
        callerId: callerIdSelect.value,
      })

      if (tokySession) {
        setupSessionListeners(tokySession)
      }
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
      tokySession
        .hold()
        .then(() => {
          console.warn('--- HOLD action success')
        })
        .catch(() => {
          console.warn('--- HOLD action unsuccess')
        })
    }
  })

  recordBtn.addEventListener('click', () => {
    if (tokySession) {
      tokySession
        .record()
        .then(() => {
          console.warn('--- RECORD action success')
        })
        .catch(() => {
          console.warn('--- RECORD action unsuccess')
        })
    }
  })

  cancelTransferBtn.addEventListener('click', () => {
    if (tokySession) {
      tokySession
        .cancelTransfer()
        .then(() => {
          console.warn('--- Cancel Transfer action success')
        })
        .catch(() => {
          console.warn('--- Cancel Transfer action unsuccess')
        })
    }
  })

  transferBtn.addEventListener('click', () => {
    if (tokySession) {
      if (transferTypeSelected === 'Agent') {
        tokySession.makeTransfer({
          type: TransferEnum.AGENT,
          destination: transferData.value,
          option: warmOption ? 'warm' : 'blind',
        })
      }

      if (transferTypeSelected === 'Group') {
        tokySession.makeTransfer({
          type: TransferEnum.GROUP,
          destination: transferData.value,
          option: warmOption ? 'warm' : 'blind',
        })
      }

      if (transferTypeSelected === 'Number') {
        tokySession.makeTransfer({
          type: TransferEnum.NUMBER,
          destination: transferData.value,
          option: warmOption ? 'warm' : 'blind',
        })
      }
    }
  })
}

main()
