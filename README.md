# Capacity — Task tracker

A private task-capacity dashboard built with Next.js App Router, Firebase
Authentication, and Cloud Firestore. Tasks update in real time and are converted
into an ordered weekday-only delivery schedule.

Google sessions use Firebase browser-local persistence. After the first login,
the user stays signed in across tabs and browser restarts until they explicitly
sign out, clear site data, or the account session is revoked.

## Local development

1. Use Node.js 20.9 or newer.
2. Copy `.env.example` to `.env.local` and add the Firebase web-app values.
3. Install dependencies with `npm install`.
4. Run `npm run dev` and open `http://localhost:3000`.

The Firebase web configuration has deployment-safe defaults in `lib/firebase.ts`.
A local `.env.local` remains ignored by Git, and `NEXT_PUBLIC_FIREBASE_*`
variables can override the defaults for another Firebase environment.

## Firebase setup

In the Firebase console:

1. Enable Google under **Authentication → Sign-in method**.
2. Create a Cloud Firestore database.
3. Add every production hostname under **Authentication → Settings →
   Authorized domains**.
4. Deploy the versioned rules:

   ```sh
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:rules
   ```

User settings are stored on `users/{uid}` and tasks under
`users/{uid}/tasks/{taskId}`. The rules ensure each signed-in user can access
only their own documents.

## Validation

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

## Netlify deployment

The repository includes `netlify.toml` and `.nvmrc`, pinning the Node and npm
versions used for the verified clean build. Netlify runs `npm run build`,
publishes `.next`, and automatically applies its current Next.js adapter.

Firebase web configuration is public project-identification metadata, not an
authorization secret. Firestore access remains protected by `firestore.rules`
and each authenticated user ID.

After Netlify assigns the production domain, add that hostname under Firebase
**Authentication → Settings → Authorized domains** so Google sign-in can open
from the deployed site.
