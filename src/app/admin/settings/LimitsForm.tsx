'use client';

import { saveLimits } from '../actions';
import { Icon, btnCls, inputCls } from '../kit';
import { ActionForm, Field, SaveBar, Submit } from '../ui';

type V = {
  photo_max_mb: number;
  video_max_mb: number;
  max_inflight_uploads: number;
  temp_cap_mb: number;
  snaps_cap_mb: number;
  upload_ttl_minutes: number;
};

export function LimitsForm({ v }: { v: V }) {
  const num = (name: keyof V, label: string, min: number, max: number, hint?: string) => (
    <Field label={label} hint={hint ?? `${min} to ${max}`}>
      <input name={name} type="number" required min={min} max={max} defaultValue={v[name]} className={inputCls} />
    </Field>
  );
  return (
    <ActionForm action={saveLimits} className="ad-formgrid">
      <section className="ad-card rise space-y-4">
        <div>
          <h2 className="ad-card-title">
            <Icon name="upload" size={18} /> Uploads
          </h2>
          <p className="ad-card-sub">How big a single photo or video can be, and how uploads are handled.</p>
        </div>
        <div className="ad-fields ad-fields-2">
          {num('photo_max_mb', 'Max photo size (MB)', 1, 50)}
          {num('video_max_mb', 'Max video size (MB)', 1, 300)}
          {num('max_inflight_uploads', 'Concurrent uploads per user', 1, 5)}
          {num('upload_ttl_minutes', 'Upload session lifetime (min)', 5, 1440)}
        </div>
      </section>
      <section className="ad-card rise space-y-4">
        <div>
          <h2 className="ad-card-title">
            <Icon name="disk" size={18} /> Storage caps
          </h2>
          <p className="ad-card-sub">The dashboard warns you when disk use passes 80% of these caps.</p>
        </div>
        <div className="ad-fields ad-fields-2">
          {num('temp_cap_mb', 'Temp upload area cap (MB)', 64, 1000000)}
          {num('snaps_cap_mb', 'Snap storage cap (MB)', 64, 1000000)}
        </div>
      </section>
      <SaveBar hint="New limits apply to uploads started after you save.">
        <Submit className={btnCls}>
          <Icon name="check" size={16} /> Save limits
        </Submit>
      </SaveBar>
    </ActionForm>
  );
}
