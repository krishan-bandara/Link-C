'use client';

import { useState } from 'react';
import { savePushSettings, sendTestPush } from '../actions';
import { Icon, btnCls, btnGhostCls, inputCls } from '../kit';
import { ActionForm, Field, SaveBar, Submit } from '../ui';

type V = { enabled: boolean; title: string; body: string; offline_after_seconds: number };

export function PushForm({ v }: { v: V }) {
  const [title, setTitle] = useState(v.title);
  const [body, setBody] = useState(v.body);
  return (
    <ActionForm action={savePushSettings} className="ad-formgrid">
      <section className="ad-card rise space-y-4">
        <div>
          <h2 className="ad-card-title">
            <Icon name="bell" size={18} /> Alert text
          </h2>
          <p className="ad-card-sub">
            Keep it generic. Do not put names or message text here: it can show on a locked screen and passes through Apple or Google.
          </p>
        </div>
        <label className="ad-check">
          <input type="checkbox" name="enabled" defaultChecked={v.enabled} />
          Push notifications enabled
        </label>
        <Field label="Title" hint={`${title.length}/60`}>
          <input name="title" required maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Message" hint={`${body.length}/140`}>
          <textarea name="body" required maxLength={140} rows={2} value={body} onChange={(e) => setBody(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Send after being away for (seconds)" hint="60 to 3600. One alert per time away, not one per message.">
          <input name="offline_after_seconds" type="number" required min={60} max={3600} defaultValue={v.offline_after_seconds} className={inputCls} />
        </Field>
        <div className="rounded-2xl border border-line p-3" aria-label="Preview">
          <p className="text-xs text-muted">Preview</p>
          <p className="mt-1 text-sm font-semibold">{title || 'Title'}</p>
          <p className="text-sm text-muted">{body || 'Message'}</p>
        </div>
      </section>
      <SaveBar hint="Applies to the next alert that is sent.">
        <Submit className={btnCls}>
          <Icon name="check" size={16} /> Save
        </Submit>
      </SaveBar>
    </ActionForm>
  );
}

export function TestPushForm({ hasDevice }: { hasDevice: boolean }) {
  return (
    <ActionForm action={sendTestPush}>
      <Submit className={btnGhostCls} disabled={!hasDevice}>
        <Icon name="send" size={16} /> Send a test to my phone
      </Submit>
      {!hasDevice && <p className="mt-2 text-xs text-muted">Turn notifications on in Settings on your own phone first.</p>}
    </ActionForm>
  );
}
