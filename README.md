# Toky Phone JS SDK

The Toky Phone JS SDK is a WebRTC Javascript library providing an abstraction to the Toky phone system, including its main features.

## Prerequisites

- You will need an active Toky Account
- The App should be Browser-based
- An API key from the Toky Web App

## What can you do?

Make calls, receive web calls, all of the operations related to a call, mute, hold, recording, transfer call to other Agents, Groups or Numbers, Blind transfers and Warm.

## Installation

Clone the repository or download the [zip](https://github.com/monbro/javascript-sdk-boilerplate/archive/master.zip) or install from npm.

`$ npm install --save toky-phone-js-sdk`

## Authentication

- In order to authenticate, first you need an API key provided by the Toky Web App, you can find info in this guide: https://help.toky.co/en/articles/2299425-where-can-i-find-the-api-key
- The second step is to register your App: https://toky-phone-js-sdk.readme.io/reference#applications
- Once you register an Application the the third step is to obtain an Access Token: https://toky-phone-js-sdk.readme.io/reference#access_token

## Connecting and registering

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

```javascript
let tokySession = Client.startCall({
  phoneNumber: '+595217288659' /* example number */,
  callerId: '+13344413569' /* example caller id from the company */,
})
```

## Mute call

```javascript
tokySession.mute()
```

## Hold Call

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

## Record Call

This option will work if the agent has the corresponding permissions

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

## Transfer call with Blind and Warm options

```javascript
const { TransferEnum, TransferOptionsEnum } = TokySDK

tokySession.makeTransfer({
  type: TransferEnum.AGENT,
  destination: 'jane@doe.com',
  option: TransferOptionsEnum.BLIND,
})

tokySession.makeTransfer({
  type: TransferEnum.GROUP,
  destination: '123' /* A valid group id that you get from the API */,
  option: TransferOptionsEnum.WARM,
})

tokySession.makeTransfer({
  type: TransferEnum.NUMBER,
  destination: '+595217288659',
  option: TransferOptionsEnum.BLIND,
})
```

## Cancel transfer

The cancel transfer option will work only for Warm Transfers

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

## End Call

```javascript
tokySession.endCall()
```

# Audio device selection

The `MediaStatus.READY` is emitted when the devices permissions had been allowed by the user

```javascript
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

  /* The list of devices available, and can be used to switch devices */
  console.log(Client.inputs, Client.outputs)

  console.log(`Selected input: ${Client.selectedInputDevice.name}`)
  console.log(`Selected ouput: ${Client.selectedOutputDevice.name}`)
})
```

To support this project, please consider to [donate](https://www.gittip.com/monbro/).

This software is published under the MIT-License. See 'license' for more information.
