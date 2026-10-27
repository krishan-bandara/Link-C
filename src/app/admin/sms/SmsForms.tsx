'use client';

import type { FormEvent } from 'react';
import { saveSmsSettings, sendTestSms } from '../actions';
import { Icon, btnCls, btnGhostCls, inputCls } from '../kit';
import { ActionForm, Field, SmsTemplateField, Submit } from '../ui';

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
  step2_after_minutes: number;
  repeat_every_minutes: number;
  template_step2: string;
  template_step3: string;
  daily_cap: number;
  monthly_cap: number;
  quiet_start: string;
  quiet_end: string;
  hasCredentials: boolean;
};

/** A field inside a closed section cannot show its validation bubble, so open that section. */
function openOnInvalid(e: FormEvent<HTMLElement>) {
  (e.target as HTMLElement).closest('details')?.setAttribute('open', '');
}

export function SmsSettingsForm({ v }: { v: SmsFormValues }) {
  return (
    <div className="sms-form" onInvalidCapture={openOnInvalid}>
      <ActionForm action={saveSmsSettings} className="sms-form">
        <details className="sms-sec" open>
          <summary>
            <Icon name="clock" size={18} /> Schedule
          </summary>
          <div className="sms-sec-body">
            <div className="sms-two">
              <Field label="SMS 1: offline after (s)" hint="Min 30 (the app reports online every 10 s).">
                <input name="offline_after_seconds" type="number" min={30} defaultValue={v.offline_after_seconds} className={inputCls} />
              </Field>
              <Field label="SMS 2 after SMS 1 (minutes)" hint="Recommended 5.">
                <input name="step2_after_minutes" type="number" min={1} max={1440} defaultValue={v.step2_after_minutes} className={inputCls} />
              </Field>
            </div>
            <Field label="SMS 3 after SMS 2 (minutes)" hint="Recommended 10. SMS 3 is the last one: at most 3 SMS per offline period, then none until they open the app.">
              <input name="repeat_every_minutes" type="number" min={1} max={1440} defaultValue={v.repeat_every_minutes} className={inputCls} />
            </Field>
            <div className="sms-two">
              <Field label="SMS per day (all members together)" hint="One shared count for everyone, resets at midnight. Default 75.">
                <input name="daily_cap" type="number" min={0} defaultValue={v.daily_cap} className={inputCls} />
              </Field>
              <Field label="SMS per month (all members together)" hint="Keep it above 31 times the daily count.">
                <input name="monthly_cap" type="number" min={0} defaultValue={v.monthly_cap} className={inputCls} />
              </Field>
            </div>
            <div className="sms-two">
              <Field label="No SMS from" hint="Colombo time. Leave both empty to allow SMS all day.">
                <input name="quiet_start" type="time" defaultValue={v.quiet_start} className={inputCls} />
              </Field>
              <Field label="No SMS until">
                <input name="quiet_end" type="time" defaultValue={v.quiet_end} className={inputCls} />
              </Field>
            </div>
          </div>
        </details>

        <details className="sms-sec">
          <summary>
            <Icon name="message" size={18} /> Messages
          </summary>
          <div className="sms-sec-body">
            <p className="ad-hint">Plain system-style text, no app name. A blank SMS 2 or 3 reuses SMS 1. A text set on a member overrides all three.</p>
            <div className="space-y-1">
              <span className="ad-label">SMS 1 text (max 160)</span>
              <SmsTemplateField initial={v.template_text} label="SMS 1 text" />
            </div>
            <div className="space-y-1">
              <span className="ad-label">SMS 2 text (max 160, optional)</span>
              <SmsTemplateField initial={v.template_step2} name="template_step2" label="SMS 2 text" />
            </div>
            <div className="space-y-1">
              <span className="ad-label">SMS 3 and later (max 160, optional)</span>
              <SmsTemplateField initial={v.template_step3} name="template_step3" label="SMS 3 and later text" />
            </div>
          </div>
        </details>

        <details className="sms-sec">
          <summary>
            <Icon name="server" size={18} /> Gateway (advanced)
          </summary>
          <div className="sms-sec-body">
            <label className="ad-check">
              <input type="checkbox" name="enabled" defaultChecked={v.enabled} />
              SMS alerts enabled
            </label>
            <Field label="API URL" hint="https only, port 443.">
              <input name="api_url" type="url" defaultValue={v.api_url} placeholder="https://api.provider.com/sms/send" className={inputCls} />
            </Field>
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
            <Field label="API key" hint={v.hasCredentials ? 'Stored. Leave blank to keep it.' : 'Not set. Write-only.'}>
              <input name="apiKey" type="password" autoComplete="new-password" placeholder="write-only" className={inputCls} />
            </Field>
            <Field label="API secret" hint="Write-only. Leave blank to keep it.">
              <input name="apiSecret" type="password" autoComplete="new-password" placeholder="write-only" className={inputCls} />
            </Field>
            <Field label="Body template" hint="{to} {text} {sender} {apiKey} {apiSecret} {basicAuth} {toDigits}. For query format: the query string.">
              <textarea name="body_template" defaultValue={v.body_template} rows={3} className={`${inputCls} sms-mono`} />
            </Field>
            <Field label="Headers template (JSON)" hint={'Same placeholders, e.g. {"Authorization":"Basic {basicAuth}"}.'}>
              <textarea name="headers_template" defaultValue={v.headers_template} rows={2} className={`${inputCls} sms-mono`} />
            </Field>
          </div>
        </details>

        <Submit className={`${btnCls} sms-save`}>
          <Icon name="check" size={16} /> Save SMS settings
        </Submit>
      </ActionForm>
    </div>
  );
}

export function TestSmsForm() {
  return (
    <details className="sms-sec">
      <summary>
        <Icon name="send" size={18} /> Send a test SMS
      </summary>
      <div className="sms-sec-body">
        <ActionForm action={sendTestSms} className="sms-form">
          <Field label="Phone number" hint="E.164, e.g. +94... Not stored or logged.">
            <input name="to" type="tel" inputMode="tel" required autoComplete="off" placeholder="+94..." className={inputCls} />
          </Field>
          <Submit className={`${btnGhostCls} sms-save`}>
            <Icon name="send" size={15} /> Send test
          </Submit>
        </ActionForm>
      </div>
    </details>
  );
}
