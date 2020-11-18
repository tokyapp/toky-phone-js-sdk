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
  phoneNumber: '+595991123123', /* example number */
  callerId: '+13344413569',     /* example caller id from the company */
})
```

## Mute call
```javascript
tokySession.mute()
```

To support this project, please consider to [donate](https://www.gittip.com/monbro/).

This software is published under the MIT-License. See 'license' for more information.
