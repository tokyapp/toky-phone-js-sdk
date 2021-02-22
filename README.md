# Toky Phone JS SDK
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

The Toky Phone JS SDK is a WebRTC Javascript library providing an abstraction to the Toky phone system, including its main features.

## Prerequisites

- You will need an active Toky Account
- The App should be Browser-based
- An API key from the Toky Web App

## What can you do?

Make calls, receive web calls, all of the operations related to a call, mute, hold, recording, transfer calls to other Agents, Groups or Numbers, Blind transfers, and Warm.

## Alpha version
During the alpha period, we may change aspects of the API based on authentication and feedback.

## Installation

Clone the repository or download the [zip](https://tokystorage.s3.amazonaws.com/shared/toky-js-sdk/latest.zip) or install from npm.

`$ npm install --save toky-phone-js-sdk`

## Authentication

For the authentication flow, please refer to the documentation related: [docs/authentication.md](docs/authentication.md)

## Development & Production environment
### **Development**
For the development environment we need an `.env.dev` file

```bash
npm run dev
```
Runs the app in development mode and the example in `/example` folder as well.

Open http://localhost:8080 to view it in the browser. It contains an example of the SSO authentication flow.
### **Production**
For the production environment we need an `.env.prod` file

```bash
npm run build
```
Builds the sdk for production to the `/dist` folder.

The `.env` file needs this structure as the example
```
TOKY_API_URL=""
TOKY_RESOURCES_URL=""
```
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
## Outgoing call

You can list the available **Phone Numbers** of the company, pick one, and establish a call. 

https://toky-js-sdk.toky.co/reference#agentsdids

```javascript
let tokySession = Client.startCall({
  phoneNumber: '+595217288659' /* example number */,
  callerId: '+13344413569' /* example caller id from the company */,
})
```
Once the call is established, we get a session (`tokySession`) of that call and 
later we will use it to make the following operations

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

## Session instance events

```javascript
tokySession.on(SessionStatus.MUTED, () => { /* Your code here */ })
tokySession.on(SessionStatus.UNMUTED, () => { /* Your code here */ })
tokySession.on(SessionStatus.HOLD, () => { /* Your code here */ })
tokySession.on(SessionStatus.UNHOLD, () => { /* Your code here */ })
tokySession.on(SessionStatus.RECORDING, () => { /* Your code here */ })
tokySession.on(SessionStatus.NOT_RECORDING, () => { /* Your code here */ })
```

## Transfer call events
We have several call events for transfer calls.

 `TRANSFER_FAILED` is related to the phone system rejecting the transfer operation, i.e. use an invalid agent sip username to make a blind transfer.
```javascript
tokySession.on(SessionStatus.TRANSFER_BLIND_INIT, () => { /* Your code here */ })
tokySession.on(SessionStatus.TRANSFER_WARM_INIT, () => { /* Your code here */ })
tokySession.on(SessionStatus.TRANSFER_WARM_ANSWERED, () => { /* Your code here */ )
tokySession.on(SessionStatus.TRANSFER_WARM_NOT_ANSWERED, () => { /* Your code here */ })
tokySession.on(SessionStatus.TRANSFER_WARM_COMPLETED, () => { /* Your code here */ })
tokySession.on(SessionStatus.TRANSFER_WARM_NOT_COMPLETED, () => { /* Your code here */ })
tokySession.on(SessionStatus.TRANSFER_WARM_CANCELED, () => { /* Your code here */ })
tokySession.on(SessionStatus.TRANSFER_FAILED, () => { /* Your code here */ })
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

  /* List current selected devices, input and output respectively */
  console.log(`Selected input: ${Client.selectedInputDevice.name}`)
  console.log(`Selected ouput: ${Client.selectedOutputDevice.name}`)
})
```
