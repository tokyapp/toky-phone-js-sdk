import * as SIP from 'sip.js'
import './index.css'

const extraHeaders = ['X-Connection-Country: PY', 'X-Caller-Id: +13344413569']

const remoteVideo = document.getElementById('remoteVideo') as HTMLVideoElement
const localVideo = document.getElementById('localVideo') as HTMLVideoElement

const options = {
  uri: 'carvallo__toky.co@app.toky.co;agent=yes',
  transportOptions: {
    wsServers: ['wss://dev3.dev.toky.co:10443'],
  },
  authorizationUser: 'carvallo__toky.co',
  password: 'HD553NQ8',
  userAgentString: 'toky/client-js-sdk-0.0.1/browser/version-browser',
  log: {
    builtinEnabled: true,
    level: 3,
  },
  allowLegacyNotifications: true,
  displayName: 'Carlos Carvallo SDK',
}
const userAgent = new SIP.UA(options)

userAgent.on('registered', () => {
  console.log(
    '%cRegistered successfully',
    'background: orange; color: white; font-size: small'
  )
})

const endButton = document.getElementById('endCall')
const startCall = document.getElementById('startCall')
let session = null

if (endButton) {
  endButton.addEventListener(
    'click',
    () => {
      session.terminate()
      alert('Call Ended')
    },
    false
  )
}

const trackAddedHandler = function (): void {
  // We need to check the peer connection to determine which track was added

  const pc = session.sessionDescriptionHandler.peerConnection

  // Gets remote tracks
  const remoteStream = new MediaStream()
  pc.getReceivers().forEach(function (receiver) {
    remoteStream.addTrack(receiver.track)
  })
  remoteVideo.srcObject = remoteStream
  remoteVideo.play()

  // Gets local tracks
  const localStream = new MediaStream()
  pc.getSenders().forEach(function (sender) {
    localStream.addTrack(sender.track)
  })
  localVideo.srcObject = localStream
  localVideo.play()
}

startCall.addEventListener('click', () => {
  //makes the call
  session = userAgent.invite(
    'service@dev.toky.co;company=6;dnis=+595991123123',
    {
      extraHeaders,
      sessionDescriptionHandlerOptions: {
        constraints: {
          audio: true,
          video: false,
        },
      },
    }
  )

  session.on('trackAdded', trackAddedHandler)
})
