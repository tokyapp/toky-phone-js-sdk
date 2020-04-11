const endCallBtn = document.getElementById('endCall')
const startCallBtn = document.getElementById('startCall')
const remoteAudio = document.getElementById('remoteAudio')
const localAudio = document.getElementById('localAudio')
const audioSelectOutput = document.querySelector('select#audioOutput')
const audioSelectInput = document.querySelector('select#audioInput')
const muteBtn = document.querySelector('#mute')
const callStatusTile = document.querySelector('#call-status')
const callStatusSub = document.querySelector('#call-status-sub')
const deviceStatusTile = document.querySelector('#device-status')
const deviceStatusSub = document.querySelector('#device-sub')
const testOutputBtn = document.querySelector('#play')

const { TokyClient, TokyMedia } = TokySDK

async function main() {
  let session = null
  const ringAudio = 'https://carvallo.dev.toky.co/resources/audio/ringing.ogg'

  const Client = new TokyClient({
    apiKey: 'cd756f0735c945048c8ce8963e1da4a4ecdc5ea75ba7fdb8daec9ab6dca66490',
    account: {
      user: 'carvallo@toky.co',
      type: 'agent',
      name: 'Test App',
    },
    transportLib: 'sip.js',
    media: {
      remoteSource: remoteAudio,
      localSource: localAudio,
      ringAudio: ringAudio,
    },
  })

  await Client.init()

  TokyMedia.init()

  TokyMedia.requestPermission()

  function createDeviceOptions() {
    audioSelectOutput.options.length = 0
    audioSelectInput.options.length = 0

    TokyMedia.inputs.forEach((device) => {
      const option = document.createElement('option')
      option.value = device.id
      option.text = device.name
      audioSelectInput.appendChild(option)
    })

    TokyMedia.outputs.forEach((device) => {
      const option = document.createElement('option')
      option.value = device.id
      option.text = device.name
      audioSelectOutput.appendChild(option)
    })
  }

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

  Client.on('call_accepted', () => {
    callStatusTile.classList.remove('is-info')
    callStatusTile.classList.add('is-success')
    callStatusSub.textContent = 'In call'
  })

  Client.on('call_in_progress', () => {
    callStatusTile.classList.remove('is-warning')
    callStatusTile.classList.add('is-info')
    callStatusSub.textContent = 'Ringing'
  })

  Client.on('registered', () => {
    callStatusTile.classList.add('is-warning')
    callStatusSub.textContent = 'Registered'

    startCallBtn.classList.add('is-success')
    endCallBtn.classList.add('is-danger')

    testOutputBtn.classList.add('is-info')
    muteBtn.classList.add('is-light')
  })

  Client.on('failed', () => {
    console.error('-- connection failed')
  })

  Client.on('call_ended', () => {
    console.warn('-- call ended')
    callStatusTile.classList.remove('is-success')
    callStatusSub.textContent = ''
  })

  Client.on('muted', () => {
    muteBtn.innerText = 'Unmute'
  })

  Client.on('unmuted', () => {
    muteBtn.innerText = 'Mute'
  })

  TokyMedia.on('ready', () => {
    audioSelectOutput.addEventListener('change', () => {
      TokyMedia.setOutputDevice(audioSelectOutput.value, remoteAudio).then(
        (response) => {
          if (response.success)
            console.log('Output device updated successfully!')
        }
      )
    })
    audioSelectInput.addEventListener('change', () => {
      const inputSelected = audioSelectInput.value
      if (session) {
        const connection = session.getConnection()
        TokyMedia.setInputDevice(inputSelected, connection).then((response) => {
          if (response.success)
            console.log('Input device updated successfully!')
        })
      } else {
        TokyMedia.setInputDevice(inputSelected).then((response) => {
          if (response.success)
            console.log('Input device updated successfully!')
        })
      }
    })
    createDeviceOptions()
  })

  TokyMedia.on('devices_changed', () => {
    createDeviceOptions()
  })

  TokyMedia.on('permission_not_granted', () => {
    console.error('-- Microphone permission not granted')
    deviceStatusTile.classList.add('is-danger')
    deviceStatusSub.textContent = 'Permission not granted'
  })

  TokyMedia.on('permission_granted', () => {
    console.warn('-- Microphone permission granted')
    deviceStatusTile.classList.add('is-primary')
    deviceStatusSub.textContent = 'Permission granted'
  })

  startCallBtn.addEventListener('click', () => {
    session = Client.startCall({
      phoneNumber: '+595991123123',
      callerId: '+13344413569',
    })
  })

  endCallBtn.addEventListener(
    'click',
    () => {
      session.endCall()
      alert('Call Ended')
    },
    false
  )

  muteBtn.addEventListener('click', async () => {
    if (session) {
      Client.muteInput()
    }
  })

  testOutputBtn.addEventListener('click', async () => {
    const audio = new Audio(ringAudio)
    // set default
    // audio.setSinkId(TokyMedia.getDefaultDevice().id)
    // or set selected
    audio.setSinkId(getSelectedOption(audioSelectOutput))
    audio.play().then(console.log)
  })
}

main()
