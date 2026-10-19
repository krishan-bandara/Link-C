'use client';

import { saveSmsSettings, sendTestSms } from '../actions';
import { Icon, btnCls, btnGhostCls, inputCls } from '../kit';
import { ActionForm, Field, SaveBar, SmsTemplateField, Submit } from '../ui';

export type SmsFormValues = {
  enabled: boolean;
  api_url: string;
  http_method: string;
  request_format: string;
  body_template: string;
  headers_template: string;
  sender_id: string;
  template_text: string;
  offline_after_seconds: number;
  daily_cap: number;
  monthly_cap: number;
  quiet_start: string;
  quiet_end: string;
  hasCredentials: boolean;
};

export function SmsSettingsForm({ v }: { v: SmsFormValues }) {
  return (
    <ActionForm action={saveSmsSettings} className="ad-formgrid">
      <div className="ad-stack">
        <section className="ad-card rise space-y-4">
          <div>
            <h2 className="ad-card-title">
              <Icon name="server" size={18} /> Provider settings
            </h2>
            <p className="ad-card-sub">Where alerts are sent and how the request looks.</p>
          </div>
          <label className="ad-check">
            <input type="checkbox" name="enabled" defaultChecked={v.enabled} />
            SMS alerts enabled
          </label>
          <Field label="API URL" hint="https only, port 443. Private and internal addresses are blocked.">
            <input name="api_url" type="url" defaultValue={v.api_url} placeholder="https://api.provider.com/sms/send" className={inputCls} />
          </Field>
          <div className="ad-fields ad-fields-3">
            <Field label="HTTP method">
              <select name="http_method" defaultValue={v.http_method} className={inputCls}>
                <option>POST</option>
                <option>GET</option>
              </select>
            </Field>
            <Field label="Request format">
              <select name="request_format" defaultValue={v.request_format} className={inputCls}>
                <option value="json">json (body)</option>
                <option value="form">form (urlencoded body)</option>
                <option value="query">query (URL parameters)</option>
              </select>
            </Field>
            <Field label="Sender ID">
              <input name="sender_id" defaultValue={v.sender_id} maxLength={40} className={inputCls} />
            </Field>
          </div>
          <Field label="Body template" hint="Placeholders: {to} {text} {sender} {apiKey} {apiSecret} {basicAuth} {toDigits} (number without +). For the query format this is the query string.">
            <textarea name="body_template" defaultValue={v.body_template} rows={3} className={`${inputCls} ad-mono`} />
          </Field>
          <Field label="Headers template (JSON object)" hint={'Same placeholders. For HTTP Basic login (Twilio) use {"Authorization":"Basic {basicAuth}"}.'}>
            <textarea name="headers_template" defaultValue={v.headers_template} rows={2} className={`${inputCls} ad-mono`} />
          </Field>
        </section>
      </div>

      <div className="ad-stack">
        <section className="ad-card rise space-y-4">
          <div>
            <h2 className="ad-card-title">
              <Icon name="lock" size={18} /> Credentials
            </h2>
            <p className="ad-card-sub">Write-only. Stored values are never shown again.</p>
          </div>
          <div className="ad-fields">
            <Field label="API key" hint={v.hasCredentials ? 'A value is stored. Leave blank to keep it.' : 'Not set.'}>
              <input name="apiKey" type="password" autoComplete="new-password" placeholder="write-only" className={inputCls} />
            </Field>
            <Field label="API secret" hint="Write-only. Leave blank to keep the current value.">
              <input name="apiSecret" type="password" autoComplete="new-password" placeholder="write-only" className={inputCls} />
            </Field>
          </div>
        </section>

        <section className="ad-card rise space-y-4">
          <div>
            <h2 className="ad-card-title">
              <Icon name="message" size={18} /> Alert text and limits
            </h2>
            <p className="ad-card-sub">What people receive, and how often.</p>
          </div>
          <div className="space-y-1">
            <span className="ad-label">Alert text (max 160)</span>
            <SmsTemplateField initial={v.template_text} />
          </div>
          <div className="ad-fields ad-fields-2">
            <Field label="Offline after (s)" hint="min 30">
              <input name="offline_after_seconds" type="number" min={30} defaultValue={v.offline_after_seconds} className={inputCls} />
            </Field>
            <Field label="Daily cap">
              <input name="daily_cap" type="number" min={0} defaultValue={v.daily_cap} className={inputCls} />
            </Field>
            <Field label="Monthly cap">
              <input name="monthly_cap" type="number" min={0} defaultValue={v.monthly_cap} className={inputCls} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Quiet from">
                <input name="quiet_start" type="time" defaultValue={v.quiet_start} className={inputCls} />
              </Field>
              <Field label="Quiet until">
                <input name="quiet_end" type="time" defaultValue={v.quiet_end} className={inputCls} />
              </Field>
            </div>
          </div>
        </section>
      </div>

      <SaveBar hint="Leave the key and secret blank to keep what is stored.">
        <Submit className={btnCls}>
          <Icon name="check" size={16} /> Save SMS settings
        </Submit>
      </SaveBar>
    </ActionForm>
  );
}

export function TestSmsForm() {
  return (
    <ActionForm action={sendTestSms} className="ad-card rise space-y-4">
      <div>
        <h2 className="ad-card-title">
          <Icon name="send" size={18} /> Send test SMS
        </h2>
        <p className="ad-card-sub">Check that the provider settings work.</p>
      </div>
      <Field label="Phone number" hint="E.164. The number is not stored or logged.">
        <input name="to" type="tel" inputMode="tel" required autoComplete="off" placeholder="+94..." className={inputCls} />
      </Field>
      <Submit className={btnGhostCls}>
        <Icon name="send" size={15} /> Send test
      </Submit>
    </ActionForm>
  );
}
