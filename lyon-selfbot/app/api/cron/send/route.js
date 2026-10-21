import { NextResponse } from 'next/server';
import { addTokenLog, acquireSendLock, readState, writeState } from '../../../../lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DISCORD_API = 'https://discord.com/api/v10';

async function sendMessage(userToken, channelId, content) {
  const response = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: userToken,          // user account token — no "Bot " prefix
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'X-Super-Properties': Buffer.from(JSON.stringify({ os: 'Windows', browser: 'Chrome', device: '' })).toString('base64'),
    },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not configured.' }, { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const lock = await acquireSendLock();
  if (!lock) return NextResponse.json({ ok: true, skipped: 'lock held' });

  try {
    const state = await readState();
    const now   = Date.now();
    let   dirty = false;

    for (const t of (state.tokens || [])) {
      if (t.status !== 'running') continue;
      if (t.nextSendAt && now < new Date(t.nextSendAt).getTime()) continue;

      // Loop back to 0 after finishing all channel IDs (continuous spam)
      const channelId = t.channelIds?.[t.currentIndex % (t.channelIds.length || 1)];
      if (!channelId) continue;

      const { status, payload } = await sendMessage(t.token, channelId, t.message);

      if (status === 429) {
        const retryAfter = Math.max(0, Number(payload.retry_after ?? 120));
        const waitMs     = Math.max(t.intervalSeconds * 1000, retryAfter * 1000) + 2000;
        t.nextSendAt     = new Date(now + waitMs).toISOString();
        addTokenLog(t, { status: 'warning', channelId, detail: `Rate-limited. Waiting ${Math.ceil(waitMs / 1000)}s.` });
        dirty = true;
        continue;
      }

      if (status === 401) {
        t.status     = 'stopped';
        t.nextSendAt = null;
        addTokenLog(t, { status: 'error', channelId, detail: 'Token rejected by Discord (401). Check your token and re-add it.' });
        dirty = true;
        continue;
      }

      if (!String(status).startsWith('2')) {
        addTokenLog(t, { status: 'error', channelId, detail: `HTTP ${status}: ${String(payload.message || '').slice(0, 200)}` });
        // skip this channel, move on
        t.currentIndex = (t.currentIndex || 0) + 1;
        t.nextSendAt   = new Date(now + t.intervalSeconds * 1000).toISOString();
        dirty = true;
        continue;
      }

      // Success
      t.sentCount    = (t.sentCount || 0) + 1;
      t.currentIndex = ((t.currentIndex || 0) + 1) % (t.channelIds.length || 1);
      t.nextSendAt   = new Date(now + t.intervalSeconds * 1000).toISOString();
      addTokenLog(t, { status: 'success', channelId, detail: `Sent to ${channelId}. Next in ${t.intervalSeconds}s.` });
      dirty = true;
    }

    if (dirty) await writeState(state);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Scheduler error.' }, { status: 500 });
  }
}
