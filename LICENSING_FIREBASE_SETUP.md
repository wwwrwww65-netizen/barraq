# Firebase setup — Mister Casher

## Architecture and billing

- Project: `mister-23108`.
- The desktop client uses the Firebase Web SDK only: Authentication + Cloud Firestore.
- No VPS, Cloud Functions, service-account private key, or paid Blaze service is required for the current client workflows.
- Keep the project on Spark. Firebase free quotas and limits still apply.
- Never download, package, or distribute a Firebase service-account private key.

## One-time Firebase Console setup

1. Open Firebase Console and select `mister-23108`.
2. In **Authentication → Sign-in method**, enable **Email/Password**.
3. Confirm the default Firestore database exists.
4. Open **Firestore Database → Rules**.
5. The proposed rules are in `cloud/firestore.rules`. They are deliberately restrictive:
   - Activation requests: create only; no client reads, edits, or deletes.
   - Device license: exact document get only; no listing or client writes.
   - Manager bootstrap: one-time claim of an owner-created token.
   - User profiles: self profile and same-tenant manager operations only.
   - All other collections remain denied.
6. Do not publish a broad test rule such as `allow read, write: if true`.

The application currently keeps the rules file in the repository. It does not publish rules automatically.

## Activation request and owner approval

### What the installation sends

The installation creates a document in `Activation_Requests` with:
- `type`: `trial_start`, `permanent_activate`, `extra_devices`, or `upgrade_request`
- `deviceId`, `hubDeviceId`, `clientDeviceId`
- `status: pending`
- Restaurant name, branch, phone, and tax number when supplied
- Server timestamps `createdAt` and `updatedAt`

The customer app cannot read or modify activation requests after submission. The owner reviews them in Firebase Console.

### Grant the first manager

After approving an installation:

1. Copy its `deviceId` from the activation request.
2. Choose a tenant ID, for example `tenant-<deviceId>`. Use exactly the same value in both documents below.
3. Create `DeviceLicenses/<deviceId>` with fields:
   - `deviceId`: same device ID
   - `tenantId`: chosen tenant ID
   - `status`: `active` (or `trial` if approving a trial)
   - `allowedClients`: allowed LAN device count, e.g. `2`
   - `hubDeviceId`: same device ID
   - `managerProvisioned`: `false` for the first approved installation
   - `managerUid`: `null`
   - `issuedAt`: current timestamp
4. Generate a one-time token on your computer:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
5. Create `managerBootstrap/<TOKEN>` where the document ID is the generated token. Set:
   - `deviceId`: the same device ID
   - `tenantId`: the same tenant ID
   - `status`: `approved`
   - `claimedBy`: `null`
   - `expiresAt`: timestamp about 24 hours in the future
6. Send the token privately to the restaurant manager. The manager enters it on the **إنشاء حساب مدير المنشأة** screen and chooses a username and password.
7. The app atomically changes the token to `claimed`, creates `userProfiles/<uid>` with role `manager`, and marks the license `managerProvisioned: true` with `managerUid`. The token cannot be reused.
8. For later approved devices in the same restaurant, create their `DeviceLicenses/<deviceId>` documents with the same `tenantId` and `managerProvisioned: true`; they then use the employee/manager login screen instead of first-manager setup.

The owner does not create the manager's password and does not need to know it. The manager account is not granted manager privileges before the owner-approved token is claimed.

## Employee accounts

- Managers create employee usernames and passwords from the staff screen.
- Firebase Authentication stores the password; Firestore stores only profile and permission data.
- A secondary in-memory Auth instance is used so creating an employee does not sign out the manager.
- The internal email-shaped Firebase identifier is derived from tenant ID + normalized username. It is not shown to the employee.
- The app never writes the employee password to SQLite or Firestore.

## Offline login

- After a successful online login on a Windows device, the app stores an encrypted credential verifier using Electron `safeStorage` and a salted scrypt hash.
- The plaintext password is not written to disk.
- Offline login is available only for accounts that have logged in online on that device before.
- An offline device cannot receive an immediate account-disable or permission change until it reconnects. Cloud changes take effect on the next successful online login/sync.

## Collections

| Collection | Client access |
|---|---|
| `Activation_Requests` | Create only |
| `DeviceLicenses` | Get the exact document whose ID is the device ID |
| `managerBootstrap` | Get approved token by exact ID; claim once |
| `userProfiles` | Own profile; same-tenant manager operations |
| `Licenses` (legacy) | Denied |
| `System_Tests` | Denied |
| All other collections | Denied until specific rules are designed and tested |

## Existing installations and legacy data

Before distributing this Firebase-auth build to an existing restaurant:

1. Review its existing license record in the legacy `Licenses` collection and identify the correct hub `deviceId`.
2. Do not delete or overwrite the old record. Create the corresponding `DeviceLicenses/<deviceId>` document using the approved tenant and license status.
3. Set `managerProvisioned: false` and `managerUid: null` when the restaurant must create its first Firebase manager through the one-time approval flow.
4. Create a matching `managerBootstrap/<TOKEN>` document as described above.
5. The first manager then creates a new cloud account. Old local administrator credentials are not automatically promoted to cloud manager accounts.
6. Existing staff records remain local until the new manager provisions each employee with a new username and password. Do not copy old plaintext passwords into Firestore or Firebase Authentication.

The app no longer creates or migrates license documents from a customer installation. Missing new-format license documents are reported as not found but do not automatically expire an older local license; the owner must complete the migration explicitly.

## Important limitation

This Spark-only design deliberately avoids embedding an Admin SDK key in customer software. The owner approves requests and creates license/bootstrap documents in Firebase Console. It does not provide a trusted server function for automated license issuance or immediate revocation while a device is offline.
