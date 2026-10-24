'use client';

import { Icon, btnCls, inputCls } from '../kit';
import { ActionForm, Field, SaveBar, Submit } from '../ui';
import { saveStorageAlerts } from './actions';

export function StorageForm({ v }: { v: { disk_free_alert_pct: number; b2_budget_gb: number; b2_alert_pct: number } }) {
  return (
    <ActionForm action={saveStorageAlerts} className="ad-formgrid">
      <section className="ad-card rise space-y-4">
        <div>
          <h2 className="ad-card-title">
            <Icon name="alert" size={18} /> Alert settings
          </h2>
          <p className="ad-card-sub">You get a red banner here and a push notification when a limit is close.</p>
        </div>
        <div className="ad-fields ad-fields-2">
          <Field label="Warn when server disk free is below (%)" hint="1 to 90. Critical at half of this.">
            <input name="disk_free_alert_pct" type="number" required min={1} max={90} defaultValue={v.disk_free_alert_pct} className={inputCls} />
          </Field>
          <Field label="Backblaze budget (GB)" hint="1 to 100000. The free tier is 10 GB.">
            <input name="b2_budget_gb" type="number" required min={1} max={100000} defaultValue={v.b2_budget_gb} className={inputCls} />
          </Field>
          <Field label="Warn when Backblaze use reaches (%)" hint="10 to 99. Critical at 95%.">
            <input name="b2_alert_pct" type="number" required min={10} max={99} defaultValue={v.b2_alert_pct} className={inputCls} />
          </Field>
        </div>
      </section>
      <SaveBar hint="Takes effect at the next check (every 10 minutes).">
        <Submit className={btnCls}>
          <Icon name="check" size={16} /> Save alert settings
        </Submit>
      </SaveBar>
    </ActionForm>
  );
}
