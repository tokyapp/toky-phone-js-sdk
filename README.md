# Toky Phone JS SDK

The Toky Phone JS SDK is a WebRTC Javascript library providing an abstraction to the Toky phone system, including its main features.

## Prerequisites

- You will need an active Toky Account
- The App should be Browser-based
- An API key from the Toky Web App

## What can you do?

Make calls, receive web calls, all of the operations related to a call, mute, hold, recording, transfer calls to other Agents, Groups or Numbers, Blind transfers, and Warm.

## Installation

Clone the repository or download the [zip]() or install from npm.

`$ npm install --save toky-phone-js-sdk`

## Authentication

- To authenticate, first, you need an API key provided by the Toky Web App. You can find info in this guide: 
    - https://help.toky.co/en/articles/2299425-where-can-i-find-the-api-key
- The second step is to register your App:
    -  https://toky-phone-js-sdk.readme.io/reference#applications
- Once you register an Application, the next step is to obtain an Access Token:
    - https://toky-phone-js-sdk.readme.io/reference#access_token

## Connecting and registering

The `.init()` method is making an automatic registration with the phone system.

```javascript
import TokySDK from 'toky-phone-js-sdk'

const { TokyClient } = TokySDK

const Client = new TokyClient({
  accessToken: '{{access_token}}',
  account: {
    user: 'john@doe.com',
    type: 'agent',
  },
  transportLib: 'sip.js',
})

await Client.init()
```

## Outgoing call

You can list the available **Phone Numbers** of the company, pick one of them, and establish a call. 

https://toky-phone-js-sdk.readme.io/reference#agentsdids

```javascript
let tokySession = Client.startCall({
  phoneNumber: '+595217288659' /* example number */,
  callerId: '+13344413569' /* example caller id from the company */,
})
```

## TokyClient instance events

### Registration events
```javascript
const { ClientStatus } = TokySDK

Client.on(ClientStatus.REGISTERED, () => { /* Your code here */ })
Client.on(ClientStatus.UNREGISTERED, () => { /* Your code here */ })
```
The **Connecting** event is emitted whenever a call is starting and is the first event before a **Ringing** event in the Session instance
```javascript
const { ClientStatus } = TokySDK

Client.on(ClientStatus.CONNECTING, () => { /* Your code here */ })
```
### Media status events
```javascript
const { MediaStatus } = TokySDK

Client.on(MediaStatus.READY, () => { /* Your code here */ })
Client.on(MediaStatus.UPDATED, () => { /* Your code here */ })
Client.on(MediaStatus.INPUT_UPDATED, () => { /* Your code here */ })
Client.on(MediaStatus.OUTPUT_UPDATED, () => { /* Your code here */ })
Client.on(MediaStatus.PERMISSION_GRANTED, () => { /* Your code here */ })
Client.on(MediaStatus.PERMISSION_REVOKED, () => { /* Your code here */ })
```

## Session instance methods
### Mute call

```javascript
tokySession.mute()
```

### Hold Call

```javascript
tokySession
  .hold()
  .then(() => {
    console.warn('--- HOLD action success')
  })
  .catch(() => {
    console.warn('--- HOLD action unsuccess')
  })
```

### Record Call

This option will work if the agent has the corresponding permissions.

```javascript
tokySession
  .record()
  .then(() => {
    console.warn('--- RECORD action success')
  })
  .catch(() => {
    console.warn('--- RECORD action unsuccess')
  })
```

### Transfer call with Blind and Warm options

```javascript
const { TransferEnum, TransferOptionsEnum } = TokySDK

tokySession.makeTransfer({
  type: TransferEnum.AGENT,
  destination: 'jane@doe.com',
  option: TransferOptionsEnum.BLIND,
})

tokySession.makeTransfer({
  type: TransferEnum.NUMBER,
  destination: '+595217288659',
  option: TransferOptionsEnum.BLIND,
})
```

### Cancel transfer

The cancel transfer option will work only for Warm Transfers.

```javascript
tokySession
  .cancelTransfer()
  .then(() => {
    console.warn('--- Cancel Transfer action success')
  })
  .catch(() => {
    console.warn('--- Cancel Transfer action unsuccess')
  })
```

### End Call

```javascript
tokySession.endCall()
```

## Audio device selection

The `MediaStatus.READY` is emitted when the user's permissions had been allowed.

```javascript
const { MediaStatus } = TokySDK

Client.on(MediaStatus.READY, () => {
  /* The device id */
  const outputDevice = '230988012091820398213'
  Client.setOutputDevice(outputDevice).then(() => {
    console.log('Output device updated successfully!')
  })

  /**
   * This is applied for established calls
   * it allows you to switch audio devices mid-call
   */
  const inputSelected = '120398120398123'
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

  /* The list of available devices, and can be used to switch devices */
  console.log(Client.inputs, Client.outputs)

  /* List current available devices */
  console.log(`Selected input: ${Client.selectedInputDevice.name}`)
  console.log(`Selected ouput: ${Client.selectedOutputDevice.name}`)
})
```
