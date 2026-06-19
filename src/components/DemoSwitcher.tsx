import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isDemoMode } from '@/services/supabase/client';

interface Profile { id: string; full_name: string; role: string }

export function DemoSwitcher() {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isDemoMode()) return;
    const ps = window.__demo?.listProfiles() ?? [];
    setProfiles(ps as Profile[]);
  }, []);

  if (!isDemoMode()) return null;

  async function switchTo(id: string) {
    setOpen(false);
    await window.__demo?.setActiveUser(id);
    navigate('/', { replace: true });
  }

  return (
    <div className="demo-switcher">
      <button type="button" className="demo-switcher__chip" onClick={() => setOpen((v) => !v)}>
        <span className="demo-switcher__dot" />
        Demo
      </button>
      {open ? (
        <div className="demo-switcher__menu" role="menu">
          <div className="demo-switcher__label">Switch role</div>
          {profiles.map((p) => (
            <button key={p.id} type="button" className="demo-switcher__item" onClick={() => switchTo(p.id)}>
              <span style={{ flex: 1 }}>{p.full_name}</span>
              <span className="card__meta" style={{ textTransform: 'capitalize' }}>{p.role}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
