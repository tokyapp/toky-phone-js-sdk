import { getButtons } from './demo-utils.js'

const endCallBtn = document.getElementById('endCall')
const startCallBtn = document.getElementById('startCall')

const audioSelectOutput = document.querySelector('select#audioOutput')
const audioSelectInput = document.querySelector('select#audioInput')
const transferType = document.querySelector('select#transferType')
const transferData = document.querySelector('#transferData')
const warmOptionEl = document.querySelector('#warmOption')
const apiKey = document.querySelector('#apiKey')
const agent = document.querySelector('#agent')
const startBtn = document.querySelector('#startBtn')
const muteBtn = document.querySelector('#mute')
const holdBtn = document.querySelector('#hold')
const recordBtn = document.querySelector('#record')
const transferBtn = document.querySelector('#transfer')
const callStatusTile = document.querySelector('#call-status')
const callStatusSub = document.querySelector('#call-status-sub')
const deviceStatusTile = document.querySelector('#device-status')
const deviceStatusSub = document.querySelector('#device-sub')
const testOutputBtn = document.querySelector('#play')

const keypad = getButtons('keypad')

// prettier-ignore
const incomingRingAudio = 'https://carvallo.dev.toky.co/resources/audio/piano-ring.ogg'
const ringAudio = 'https://carvallo.dev.toky.co/resources/audio/ringing.ogg'
const errorAudio = 'https://carvallo.dev.toky.co/resources/audio/error.ogg'

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

function setupSessionListeners(currentSession) {
  currentSession.on(SessionStatus.ACCEPTED, () => {
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

  currentSession.on(SessionStatus.NOT_RECORDING, () => {
    recordBtn.innerText = 'Record call'
  })
}

// Add click listeners to keypad buttons
keypad.forEach((button) => {
  button.addEventListener('click', () => {
    console.log('button', button.textContent)
    const tone = button.textContent
    if (tone) {
      tokySession.processDTMF(tone).then(() => {
        console.info('-- succesfully process DTMF')
      })
    }
  })
})

async function main() {
  let transferTypeSelected = transferType.value
  let warmOption = false

  startBtn.addEventListener('click', async () => {
    Client = new TokyClient({
      apiKey: apiKey.value,
      account: {
        user: agent.value,
        type: 'agent',
        name: 'Test App',
      },
      transportLib: 'sip.js',
      media: {
        ringAudio: ringAudio,
        errorAudio: errorAudio,
        incomingRingAudio: incomingRingAudio,
      },
    })

    await Client.init()

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

      testOutputBtn.classList.add('is-info')
      muteBtn.classList.add('is-light')
    })

    Client.on(ClientStatus.INVITE, (incomingSession) => {
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
    })

    Client.on(MediaStatus.UPDATED, () => {
      createDeviceOptions(Client.inputs, Client.outputs)
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

  /**
   * Utilities and Event Listeners related to Demo App
   */

  function getSelectedOption(select) {
    try {
      return select.options[select.selectedIndex].value
    } catch (e) {
      return undefined
    }
  }

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
        phoneNumber: '+595991123123',
        callerId: '+13344413569',
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

  transferBtn.addEventListener('click', () => {
    if (tokySession) {
      if (transferTypeSelected === 'Agent') {
        tokySession.makeTransfer({
          type: TransferEnum.AGENT,
          destination: transferData.value,
          option: warmOption && 'warm',
        })
      }

      if (transferTypeSelected === 'Group') {
        tokySession.makeTransfer({
          type: TransferEnum.GROUP,
          destination: transferData.value,
          option: warmOption && 'warm',
        })
      }

      if (transferTypeSelected === 'Number') {
        tokySession.makeTransfer({
          type: TransferEnum.NUMBER,
          destination: transferData.value,
          option: warmOption && 'warm',
        })
      }
    }
  })

  testOutputBtn.addEventListener('click', () => {
    const audio = new Audio(ringAudio)
    // set default
    // audio.setSinkId(Media.getDefaultDevice().id)
    // or set selected
    audio.setSinkId(getSelectedOption(audioSelectOutput))
    audio.play().then(console.log)
  })
}

main()
