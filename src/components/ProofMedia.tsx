import { useEffect, useState } from 'react';
import { getProofUrl } from '@/services/media/proofUrls';
import type { TaskProof } from '@/domain/models/ops';

interface Props {
  proof: TaskProof;
  /** Width in CSS pixels; defaults to fluid. */
  size?: number;
}

export function ProofMedia({ proof, size }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getProofUrl(proof.storagePath).then((u) => {
      if (cancelled) return;
      if (!u) { setError(true); return; }
      setUrl(u);
    });
    return () => { cancelled = true; };
  }, [proof.storagePath]);

  const style = size ? { width: size, height: size } : undefined;

  if (error) {
    return <div className="proof-media proof-media--missing" style={style}>×</div>;
  }
  if (!url) {
    return <div className="proof-media proof-media--loading" style={style} />;
  }
  if (proof.mime.startsWith('video/')) {
    return <video src={url} controls className="proof-media" style={style} />;
  }
  return <img src={url} alt={`${proof.kind} proof`} className="proof-media" style={style} />;
}
