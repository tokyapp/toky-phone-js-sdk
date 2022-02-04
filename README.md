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

The two environments require `.env` files, and it works like this.

In compilation time, it automatically uses the `.env` file depending on your _git branch_. It looks like this:

```
Git Branch   Environment file
==========   ================
main         .env.prod
staging      .env.staging
dev          .env.dev
```
`.env.example`

```
TOKY_API_URL="https://api.toky.co"
TOKY_RESOURCES_URL="https://app.toky.co"
PUSHER_KEY="" # Warm transfer feature
AGENT_ID="" # Your Toky Agent Id
```
### **Development**
You can use the `.env.example` as the base for your `.env.dev` file.

In the `main.js` in the `example` folder, replace the variable `currentAppId` with your corresponding generated **App Id**, this in mandatory:

```javascript
const currentAppId = 'yourappid'
const currentAppKey = 'yourappkey'
```

Then you can run:
```bash
npm run dev
```
This script runs the app in development mode and the Dialer in the `/example` folder.

It would open a tab in your browser, starting the authentication flow.
### **Production**
For the production environment, we need an `.env.prod` file also based on the `.env.example`

```bash
npm run build
```
Builds the SDK for production to the `/dist` folder, ready to use as a _Module_ or in a _script tag_.
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
    acceptInboundCalls: false,
  },
  transportLib: 'sip.js',
})

await Client.init()
```

## Refresh Token
The refresh token method is useful when an access token has expired
```javascript
Client.refreshToken('yournewaccesstoken')
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
The **Invite** event is emitted when you are receiving a call (only if the ***acceptInboundCalls*** param is true)
```javascript
Client.on(ClientStatus.INVITE, () => { /* Your code here */ })
```
The **Session Updated** event is emitted when a call session changed. This event give us a session (`tokySession`) of that call and
later we will use it to make other operations
```javascript
Client.on(ClientStatus.SESSION_UPDATED, (data) => { 
  tokySession = data.session;
  /* Your code here */ 
})
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
Client.startCall({
  phoneNumber: '+595217288659' /* example number */,
  callerId: '+13344413569' /* example caller id from the company */,
})
```

## Session instance methods
You should use your session (`tokySession`) received on the event `ClientStatus.SESSION_UPDATED` to perform these operations
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
tokySession.on(SessionStatus.HOLD_NOT_AVAILABLE, () => { /* Your code here */ })
tokySession.on(SessionStatus.RECORDING, () => { /* Your code here */ })
tokySession.on(SessionStatus.NOT_RECORDING, () => { /* Your code here */ })
tokySession.on(SessionStatus.RECORDING_NOT_AVAILABLE, () => { /* Your code here */ })
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

`TokyMedia` is the singleton in charge of everything related to Devices/Media.

The `MediaStatus.READY` is emitted when the user's permissions had been allowed.

```javascript
const { TokyMedia, MediaStatus } = TokySDK

TokyMedia.on(TokyMedia.READY, () => {
  /* The device id */
  const outputDevice = '123asd123asd123'
  TokyMedia.setOutputDevice(outputDevice).then(() => {
    console.log('Output device updated successfully!')
  })

  /**
  * This is applied for established calls
  * it allows you to switch audio devices mid-call
  */
  const inputSelected = 'asd123asd123asd'
  if (tokySession) {
    const connection = tokySession.getConnection()
    TokyMedia.setInputDevice(inputSelected, connection).then(() => {
      console.log('Input device updated successfully!')
    })
  } else {
    TokyMedia.setInputDevice(inputSelected).then(() => {
      console.log('Input device updated successfully!')
    })
  }

  /* The list of available devices, and can be used to switch devices */
  console.log(TokyMedia.inputs, TokyMedia.outputs)

  /* List current selected devices, input and output respectively */
  console.log(`Selected input: ${TokyMedia.selectedInputDevice.name}`)
  console.log(`Selected ouput: ${TokyMedia.selectedOutputDevice.name}`)
})
```
## License

[`MIT Licence`](./LICENSE) © [Toky](https://toky.co)
