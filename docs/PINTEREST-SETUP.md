# Pinterest board integration

The studio uses the Pinterest v5 API. It can list boards and pins after authorization. Public searches and saved references work without these credentials.

Configure the following **server runtime variables** on the deployed Site:

| Variable | Value |
|---|---|
| `PINTEREST_APP_ID` | Your registered Pinterest application ID |
| `PINTEREST_APP_SECRET` | The matching client secret; mark as secret |
| `PINTEREST_REDIRECT_URI` | `https://threadform-studio.dsynhouse.chatgpt.site/api/integrations/pinterest/callback` |
| `INTEGRATION_ENCRYPTION_KEY` | A random 32-byte key, base64 encoded; mark as secret |

Register that exact redirect URI with Pinterest. Obtain the applicable provider access for the app. Publish the new environment revision, then use Inspiration → Connect Pinterest to grant `boards:read,pins:read`.

The code requests read-only access to public boards and pins. It does not request permission to publish pins or read secret boards. Tokens are encrypted server-side and tied to the browser studio. Disconnect deletes local connection material; visitors can also revoke the application in Pinterest's account settings.

Do not paste client secrets into frontend code, project files, or the inspiration form. Changing the encryption key makes existing encrypted tokens unreadable; disconnect or migrate old connections during key rotation.

Official references: [OAuth authorization](https://developers.pinterest.com/docs/getting-started/set-up-authentication-and-authorization/), [token endpoint](https://github.com/pinterest/pinterest-python-generated-api-client/blob/main/docs/OauthApi.md), [boards and pins](https://github.com/pinterest/pinterest-python-generated-api-client/blob/main/docs/BoardsApi.md).
