# Toky Phone JS SDK Authentication

## Setting up SSO for SDK Authentication

Allow agents to securely authenticate to Toky Phone JS SDK using Toky’s Single Sign-on (SSO).

Single sign-on is an authentication method that enables users to access multiple applications with one login and one set of credentials. For this case, after a user log in to the Toky Web-app, they can use this session to authenticate against the **Toky Phone JS SDK**, and from that starting point, we can request an _access token_ using Toky’s JWT endpoints.
To start the authentication flow, we need to follow the next steps:

- Register an application that would be authorized to use the **Toky Phone JS SDK** https://toky-js-sdk.toky.co/reference#applications
- As the `app_id`, we would use as an example the following code: `dlecvowlrblmutimutksueduqnekojze`
- You need to set the **SSO URL** like so: https://app.toky.co/auth/sso/login/dlecvowlrblmutimutksueduqnekojze?redirect_url=https://mydomain.com.
- In this example, https://mydomain.com refers to the URL that the service would redirect after the authentication is successful.
- We have to consider that the `redirect_url` has to be an authorized domain previously listed in the App creation.
- Once again, you can find an example in https://toky-js-sdk.toky.co/reference#applications.
- Once the authentication is successful, the service redirects to the `redirect_url` with an **authorization code**, e. g. https://mydomain.com?code=123123123123
- With this authorization code `123123123123`, you can start requesting an _access token_ using Toky’s related endpoint:https://toky-js-sdk.toky.co/reference#access_token
- Once we have an access token, you can use this to initialize the Toky Phone JS SDK.

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

If you have any questions about this process, please contact support@toky.co