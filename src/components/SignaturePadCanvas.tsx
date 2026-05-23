import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import SignaturePad from 'signature_pad';

export interface SignaturePadHandle {
  clear: () => void;
  isEmpty: () => boolean;
  toDataUrl: () => string;
}

interface Props {
  placeholder?: string;
  onEmptyChange?: (empty: boolean) => void;
}

export const SignaturePadCanvas = forwardRef<SignaturePadHandle, Props>(
  ({ placeholder, onEmptyChange }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const padRef = useRef<SignaturePad | null>(null);
    const [empty, setEmpty] = useState(true);

    const markEmpty = (value: boolean) => {
      setEmpty(value);
      onEmptyChange?.(value);
    };

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const pad = new SignaturePad(canvas, {
        penColor: '#0f172a',
        backgroundColor: 'rgba(255,255,255,0)',
        minWidth: 1.1,
        maxWidth: 2.6,
      });
      padRef.current = pad;

      const resize = () => {
        // Preserve drawing across resizes.
        const data = pad.toData();
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * ratio;
        canvas.height = rect.height * ratio;
        const ctx = canvas.getContext('2d');
        ctx?.scale(ratio, ratio);
        pad.clear();
        if (data.length) {
          pad.fromData(data);
          markEmpty(false);
        } else {
          markEmpty(true);
        }
      };

      resize();
      const onEnd = () => markEmpty(pad.isEmpty());
      pad.addEventListener('endStroke', onEnd);
      window.addEventListener('resize', resize);
      window.addEventListener('orientationchange', resize);

      return () => {
        pad.removeEventListener('endStroke', onEnd);
        window.removeEventListener('resize', resize);
        window.removeEventListener('orientationchange', resize);
        pad.off();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useImperativeHandle(ref, () => ({
      clear: () => {
        padRef.current?.clear();
        markEmpty(true);
      },
      isEmpty: () => padRef.current?.isEmpty() ?? true,
      toDataUrl: () => padRef.current?.toDataURL('image/png') ?? '',
    }));

    return (
      <div className="sig-wrap">
        <canvas ref={canvasRef} className="sig-canvas" />
        {empty && placeholder ? (
          <div className="sig-placeholder">{placeholder}</div>
        ) : null}
      </div>
    );
  },
);

SignaturePadCanvas.displayName = 'SignaturePadCanvas';
