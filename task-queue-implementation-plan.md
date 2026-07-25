# Task Capacity Tracker — Production Implementation Plan
**Stack:** Next.js (App Router) + Firebase (Firestore + Auth), frontend-only architecture, deployed on Netlify.

---

## 1. Architecture at a glance

No custom backend. Next.js talks to Firestore directly from the client SDK. Firebase Auth gates access, and Firestore Security Rules do the authorization work a backend would normally do.

```
Browser (Next.js app)
   │
   ├── Firebase Auth  → who you are
   └── Firestore SDK  → real-time task data (onSnapshot)
```

Scheduling math (hours → working days → dates) stays 100% client-side — it's pure computation, no need to round-trip it through a server.

**Why this works for you specifically:** single user today, but the data model below is already shaped so a read-only share link for QA is a small add-on later, not a rebuild.

---

## 2. Data model (Firestore)

```
users/{uid}
  └── settings (doc)
        hoursPerDay: number        // default 8

  └── tasks/{taskId} (collection)
        name: string
        hours: number
        status: "pending" | "done"
        order: number              // controls queue sequence, drag/reorder writes this
        createdAt: timestamp
        updatedAt: timestamp
```

Why `order` as a plain number instead of array position: Firestore has no native array reordering that plays well with concurrent writes. A sortable `order` field (e.g. spaced by 1000: 1000, 2000, 3000…) lets you re-order by writing to just the moved doc, and insert between two tasks without rewriting the whole list.

Schedule (start/end dates per task) is **never stored** — it's derived on read from `hours`, `order`, and `hoursPerDay`, same logic as the prototype. This avoids drift between stored dates and reality when someone reorders or edits.

---

## 3. Auth

Firebase Auth, Google sign-in provider (fastest to wire up, no password reset flows to build). One collection scoped per `uid` means the security rules below are all you need for isolation — no roles/permissions system required at this stage.

```js
// Sign-in
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
signInWithPopup(auth, new GoogleAuthProvider());
```

---

## 4. Firestore Security Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      match /tasks/{taskId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

Deploy with the Firebase CLI (`firebase deploy --only firestore:rules`) — keep this file in the repo, not typed into the console, so it's versioned.

---

## 5. Project structure

```
task-queue/
├── app/
│   ├── layout.tsx              # AuthProvider wrapper
│   ├── page.tsx                # dashboard (headline stats + timeline + list + form)
│   └── login/page.tsx          # sign-in screen
├── components/
│   ├── HeadlineStats.tsx
│   ├── Timeline.tsx
│   ├── TaskList.tsx
│   ├── TaskForm.tsx
│   └── AuthGate.tsx
├── lib/
│   ├── firebase.ts             # initializeApp, getAuth, getFirestore
│   ├── schedule.ts             # pure functions: ceilDays, addWorkingDays, buildSchedule
│   └── tasks.ts                # Firestore CRUD: addTask, updateTask, deleteTask, reorder
├── hooks/
│   ├── useAuth.ts
│   └── useTasks.ts             # onSnapshot subscription → live task list
├── .env.local                  # Firebase config (NEXT_PUBLIC_* vars)
└── firestore.rules
```

`lib/schedule.ts` is a direct port of the scheduling logic from the prototype — it's already pure and framework-agnostic, so this is copy-and-adjust, not a rewrite.

---

## 6. Real-time data flow

```ts
// hooks/useTasks.ts
export function useTasks(uid: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  useEffect(() => {
    const q = query(
      collection(db, "users", uid, "tasks"),
      orderBy("order")
    );
    return onSnapshot(q, (snap) =>
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Task)))
    );
  }, [uid]);
  return tasks;
}
```

`onSnapshot` means the queue updates live — useful if you ever open it on your phone mid-standup while QA is asking about a date.

---

## 7. Environment variables

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

Firebase web config is not a secret in the traditional sense (it's visible in any client bundle) — access control comes entirely from the security rules in Section 4, not from hiding these values.

---

## 8. Build phases

| Phase | Scope | Notes |
|---|---|---|
| 1. Setup | `create-next-app`, Firebase project, Firestore + Auth enabled, env vars wired | ~1–2 hrs |
| 2. Auth | Google sign-in, `AuthGate` wrapper, redirect logic | ~2 hrs |
| 3. Data layer | `lib/tasks.ts` CRUD, `useTasks` hook, security rules deployed | ~3 hrs |
| 4. UI port | Move `HeadlineStats`, `Timeline`, `TaskList`, `TaskForm` from the HTML prototype into React components, wire to Firestore instead of `window.storage` | ~4–5 hrs |
| 5. Scheduling logic | Port `schedule.ts` as pure functions, unit test the day/date math (the part that has to be exactly right) | ~2 hrs |
| 6. Deploy | Netlify for the app, `firebase deploy --only firestore:rules` for rules | ~1 hr |

Total: roughly **13–15 hours** — call it 2 focused working days at your own 8hr/day rate. (Yes, this project can go in your own queue.)

---

## 9. Stretch: read-only share link for QA

The thing that actually fixes the underlying problem — QA seeing your load without you narrating it — is a step beyond "only frontend and DB," but it's cheap given this data model:

- Add a `shareToken` field on the `settings` doc.
- A public route `app/queue/[token]/page.tsx` queries tasks by matching a token stored per user, with a security rule allowing unauthenticated read *only* when the token matches:
  ```
  match /users/{userId}/tasks/{taskId} {
    allow read: if resource.data.shareToken == request.query.token; // conceptual — Firestore rules can't actually read query params
  }
  ```
  (In practice this is cleaner with a Cloud Function endpoint, which is backend — worth flagging as a deliberate future trade-off if you stay frontend-only.)
- You send QA one link. They see the timeline. Nobody has to ask "can you do it by Wednesday" because the answer is already on their screen.

Not required for v1, but it's the highest-leverage next step once the core tool is live.

---

## 10. What stays identical from the prototype

The hour→day math, weekend skipping, and sequential scheduling logic don't change at all — only where the data lives changes (Firestore instead of `window.storage`) and how it's rendered (React components instead of vanilla DOM manipulation). That logic is already correct and tested against your numbers, so Phase 5 is a port, not a redesign.
