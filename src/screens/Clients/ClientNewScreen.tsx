import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { AppHeader } from '@/components/AppHeader';
import { getSupabase } from '@/services/supabase/client';
import { useDirectory } from '@/app/providers/DirectoryContext';

export function ClientNewScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const directory = useDirectory();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const { data, error } = await getSupabase().from('clients').insert({
        name,
        email: email || null,
        phone: phone || null,
        address: address || null,
      }).select('id').single();
      if (error) throw error;
      await directory.refresh();
      navigate(`/clients/${data!.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <AppHeader title={t('clientNew.title', 'New client')} showBack />
      <form className="app-main" onSubmit={save}>
        {error ? <div className="banner banner--error">{error}</div> : null}
        <div className="field">
          <label className="field__label">{t('clientNew.name', 'Name')}</label>
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label className="field__label">{t('auth.email', 'Email')}</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label className="field__label">{t('clientNew.phone', 'Phone')}</label>
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="field">
          <label className="field__label">{t('clientNew.address', 'Address')}</label>
          <textarea className="textarea" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <button className="btn btn--primary btn--block btn--lg" type="submit" disabled={!name || saving}>
          {saving ? t('common.saving', 'Saving…') : t('clientNew.create', 'Create client')}
        </button>
      </form>
    </AppShell>
  );
}
