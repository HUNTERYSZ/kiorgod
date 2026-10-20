# @Lyon Discord Message Scheduler

A Vercel-ready Next.js dashboard for sending a **one-time announcement batch** to authorized Discord channels. It uses an official Discord bot, stores settings and logs in Upstash Redis, and runs scheduled work through Vercel Cron so the browser does not need to stay open.

## Important behavior

- Each enabled channel receives the saved message **once per batch**.
- A batch is limited to 20 enabled channels. You can save more channels and enable the subset needed for a particular batch.
- The minimum interval is 2 minutes. Discord rate limits are honored, and the scheduler waits longer when Discord requests it.
- The batch stops when complete. There is no infinite auto-repeat or account-token collection.
- The sender disables automatic mentions (`@everyone`, role, and user mention parsing) to reduce accidental pings.
- A webhook success log is attempted only after Discord confirms a successful message.
- Use only in servers/channels where you have permission to post.

## Deploy to Vercel

1. Create a new GitHub repository and upload this folder, or import the folder into your Git provider.
2. Create an Upstash Redis database and copy its REST URL and REST token.
3. Create a Discord application in the Discord Developer Portal, add a bot, and copy the bot token. Never put this token in frontend code or a `NEXT_PUBLIC_` variable.
4. Invite the bot to your server with only the permissions it needs, including View Channel and Send Messages in the selected channels. Enable Developer Mode in Discord to copy channel IDs.
5. Create a **new logging webhook** in the desired logging channel. The webhook URL shared in the original conversation should be rotated because it was exposed.
6. Import the project into Vercel and add all variables from `.env.example` under Project Settings → Environment Variables:
   - `ADMIN_PASSWORD`
   - `SESSION_SECRET` (at least 32 characters)
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - `DISCORD_BOT_TOKEN`
   - `DISCORD_LOG_WEBHOOK_URL`
   - `CRON_SECRET`
7. Use long, unique random values for `SESSION_SECRET` and `CRON_SECRET`. Do not prefix secrets with `NEXT_PUBLIC_`.
8. Deploy. Vercel Cron is configured in `vercel.json` to invoke `/api/cron/send` every two minutes. Confirm your Vercel plan supports this cron frequency; plan limits can change. If your plan does not support two-minute cron runs, the background queue will not run on the requested schedule until you use a plan or scheduler that supports it.
9. Open the deployment URL and log in with `ADMIN_PASSWORD`.
10. Add channel IDs, write the message, click **Save settings**, then click **Start one-time batch**.

## Local development

```bash
cp .env.example .env.local
# Fill in the environment variables, then:
npm install
npm run dev
```

The local server does not automatically run Vercel Cron. To test the cron route locally, call it with the configured bearer secret:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/send
```

Only test against a private test server/channel that you control.

## Persistence and access

- Messages, channels, interval, campaign state, and the latest 100 log entries are stored in Upstash Redis.
- The dashboard uses one shared password for a small team. Anyone with that password can change settings and stop a batch. For a larger or more sensitive deployment, add per-user authentication and audit trails.
- The session cookie is HTTP-only and Secure in production. Rotate `SESSION_SECRET` to invalidate sessions.
- Never commit `.env.local`, bot tokens, or webhook URLs to Git.

## Notes

This starter cannot be deployed to your Vercel account from this chat because it does not have your Vercel credentials. The zip contains the project files and setup instructions.
