# Load test (k6)

`quiz.js` simulates the live quiz:

- **status pollers** (30% of VUs by default) sit on the home page and poll `/api/quiz-status` every 12–18s.
- **participants** (the other 70%) open `/`, check the status, register, load questions, wait 10–40s, then submit random answers.

The default ramp goes to 5000 VUs in 2 minutes, holds for 3 minutes, then ramps down over 30s.

> **Never run this against production.** It creates thousands of participant records and sends a large burst of traffic. Use a Vercel **Preview** deployment that points at a **separate test database**.

## 1. Prepare a Preview environment

1. Create a separate database for testing, either a new Atlas cluster or a new database name on a non-production cluster. Seed it with a few test questions.
2. In Vercel → Project → Settings → Environment Variables, scope these to **Preview only** (or to one preview branch):
   - `MONGODB_URI`: the **test** database URI
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD` (12+ characters), `ADMIN_SESSION_SECRET`, `PARTICIPANT_SESSION_SECRET`
   - `RATE_LIMIT_DISABLED=1`. k6 sends everything from one IP, so the per-IP limits would block it. This flag is ignored when `VERCEL_ENV=production`.
3. Push the branch and wait for the Preview deployment.
4. If Deployment Protection is on, create a *Protection Bypass for Automation* secret under Settings → Deployment Protection. Pass it as `VERCEL_BYPASS_TOKEN`.
5. Also check Vercel Firewall rules. A rate-limit rule on Preview will block the test too.
6. Sign in to `/admin` on the Preview URL, add questions and press **Start**. Participants only register while the quiz is started.

## 2. Run

Install k6 (https://grafana.com/docs/k6/latest/set-up/install-k6/). Then:

```bash
k6 run -e BASE_URL=https://your-preview-url.vercel.app -e I_UNDERSTAND_THIS_IS_PREVIEW=yes -e VERCEL_BYPASS_TOKEN=your-bypass-secret loadtest/quiz.js
```

The script refuses to start without `BASE_URL` and `I_UNDERSTAND_THIS_IS_PREVIEW=yes`.

Optional variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `TARGET_VUS` | `5000` | Total virtual users across both scenarios |
| `POLLER_SHARE` | `0.3` | Fraction of VUs that only poll status |
| `RAMP_UP` / `HOLD` / `RAMP_DOWN` | `2m` / `3m` / `30s` | Stage durations |
| `ANSWER_TIME_MIN_S` / `ANSWER_TIME_MAX_S` | `10` / `40` | Simulated answering time |

Start small, for example `-e TARGET_VUS=200 -e RAMP_UP=30s -e HOLD=1m`, and then scale up. 5000 VUs from one machine needs a capable machine and a fast connection; Grafana Cloud k6 is an alternative. The thresholds (error rate under 1%, p95 latency per endpoint) are in `options.thresholds`.

While it runs, watch the Atlas metrics: connections, opcounters and CPU. Also watch Vercel Observability for function duration and errors.

## 3. Clean up

All test participants are named `LOADTEST …`.

- **Admin UI:** press **End** on the Preview `/admin`, then **Reset**. This deletes *all* participants in that (test) database.
- **mongosh**, connected to the **test** database:

  ```js
  db.participants.deleteMany({ fullName: /^LOADTEST / })
  ```

Afterwards, remove `RATE_LIMIT_DISABLED` from Preview or delete the preview branch's env overrides. Delete the bypass secret if you no longer need it.
