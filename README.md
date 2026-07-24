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

The supplied Firebase project values are already present in the local
`.env.local` file. That file is intentionally ignored by Git; configure the same
`NEXT_PUBLIC_FIREBASE_*` values in Vercel before deploying.

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
