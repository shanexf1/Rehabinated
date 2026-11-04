import { useEffect, useRef, useState } from 'react';
import { cueFor } from '../../core/exercise';
import { SetSession, type LiveState, type SetResult } from '../../core/session';
import type { MistakeId } from '../../core/types';
import type { PoseSource } from '../../platform/pose';
import { getExercise } from '../../exercises';
import { DemoPoseSource } from '../adapters/demoPose';
import { MediaPipePoseSource } from '../adapters/mediapipePose';
import { createWebSpeaker } from '../adapters/webSpeech';
import { Close, Mute, Speaker } from '../components/Icons';
import { PoseCanvas, type PoseCanvasHandle } from '../components/PoseCanvas';
import { TrajectoryChart } from '../components/TrajectoryChart';
import type { AppState } from '../state';

const WORDS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen'];

export function Workout({ app, exerciseId, setIndex, mode, onDone, onCancel }: {
  app: AppState;
  exerciseId: string;
  setIndex: number;
  mode: 'camera' | 'demo';
  onDone: (r: SetResult) => void;
  onCancel: () => void;
}) {
  const ex = getExercise(exerciseId)!;
  const targetReps = ex.plan.reps;
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<PoseCanvasHandle>(null);
  const [live, setLive] = useState<LiveState | undefined>();
  const [ghost, setGhost] = useState<Array<[number, number]>>();
  const [status, setStatus] = useState<'loading' | 'running' | 'error'>('loading');
  const [error, setError] = useState('');
  const [flash, setFlash] = useState<string>();
  const [voiceOn, setVoiceOn] = useState(app.settings.voice);
  const [lost, setLost] = useState(false);
  const lastFrameAt = useRef(0);
  const speaker = useRef(createWebSpeaker());
  const sessionRef = useRef<SetSession>();
  const finishing = useRef(false);

  useEffect(() => speaker.current.setEnabled(voiceOn), [voiceOn]);

  useEffect(() => {
    let source: PoseSource | undefined;
    let flashTimer: number | undefined;
    let wake: { release: () => Promise<void> } | undefined;
    let lastMistake: MistakeId | undefined;
    let lastCueRep = -10;
    let lastPhase: string | undefined;
    const say = (t: string, interrupt = false) => speaker.current.say(t, { interrupt });
    const show = (t: string) => {
      setFlash(t);
      window.clearTimeout(flashTimer);
      flashTimer = window.setTimeout(() => setFlash(undefined), 2600);
    };

    const finish = async () => {
      if (finishing.current || !sessionRef.current) return;
      finishing.current = true;
      const result = await sessionRef.current.finish();
      source?.stop();
      onDone(result);
    };

    const session = new SetSession(ex, {
      targetReps,
      scorer: app.scorer.scorer,
      onEvent: (e) => {
        if (e.type === 'rep_completed') {
          say(WORDS[e.rep.index] ?? String(e.rep.index + 1), true);
          setGhost(e.rep.curve.map((p, i, arr) => [(i / (arr.length - 1)) * e.rep.features.duration_s, p]));
        } else if (e.type === 'rep_scored') {
          const m = e.rep.score?.mistake;
          if (m && m !== 'good') {
            // Speak a cue when the same mistake shows up twice in a row, at most every 3 reps.
            if (m === lastMistake && e.rep.index - lastCueRep >= 3) {
              lastCueRep = e.rep.index;
              setTimeout(() => say(cueFor(ex, m)), 700);
            }
            show(cueFor(ex, m));
          }
          lastMistake = m;
        } else if (e.type === 'rep_rejected' && e.reason === 'too_small') {
          show('Not counted. Move a little further.');
        } else if (e.type === 'set_complete') {
          say('Set complete. Well done.');
          setTimeout(finish, 1200);
        }
      },
    });
    sessionRef.current = session;

    // The pose tracker only reports frames with a person in them, so a gap means nobody is in view.
    const lostTimer = window.setInterval(() => setLost(performance.now() - lastFrameAt.current > 1200), 400);

    const onFrame = (f: Parameters<Parameters<PoseSource['start']>[0]>[0]) => {
      lastFrameAt.current = performance.now();
      const st = session.push(f);
      if (st.phase !== lastPhase) {
        if (st.phase === 'rest' && lastPhase === 'waiting') say('Ready. Start when you are.');
        lastPhase = st.phase;
      }
      setLive(st);
      const v = video.current;
      canvas.current?.draw(f, {
        side: st.side,
        videoSize: mode === 'camera' && v?.videoWidth ? [v.videoWidth, v.videoHeight] : undefined,
        quality: st.lowConfidence ? 'off' : 'ok',
      });
    };

    (async () => {
      try {
        source = mode === 'demo' ? new DemoPoseSource(ex, targetReps) : new MediaPipePoseSource(video.current!);
        await source.start(onFrame);
        setStatus('running');
        say(`${ex.name}. Get into the start position.`);
        try {
          wake = await (navigator as any).wakeLock?.request('screen');
        } catch {
          /* optional */
        }
      } catch (err) {
        setStatus('error');
        setError(
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Camera permission was refused. Allow camera access for this site in your browser settings, then try again.'
            : `The camera or pose tracker could not start${err instanceof Error ? ` (${err.message})` : ''}. Check your connection and try again, or watch the demo.`,
        );
      }
    })();

    return () => {
      source?.stop();
      window.clearTimeout(flashTimer);
      window.clearInterval(lostTimer);
      speaker.current.setEnabled(false);
      void wake?.release();
    };
    // Run once per mounted set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const endNow = async () => {
    if (finishing.current || !sessionRef.current) return;
    finishing.current = true;
    onDone(await sessionRef.current.finish());
  };

  const banner = () => {
    if (!live || lost) return { text: 'Step into view so the camera sees your whole body', cls: 'warn' };
    if (live.lowConfidence) return { text: 'Can’t see you clearly. Step back into view.', cls: 'warn' };
    if (live.phase === 'waiting') return { text: 'Get into the start position', cls: '' };
    if (live.phase === 'rest') return { text: live.repsDone === 0 ? 'Ready. Start when you are.' : 'Good. Next rep when ready.', cls: 'go' };
    return { text: 'Follow the guide line', cls: 'go' };
  };
  const b = banner();
  const mirror = mode === 'camera';

  return (
    <div className="workout">
      <div className={`stage${mirror ? ' mirror' : ''}`}>
        {mode === 'camera' && <video ref={video} playsInline muted />}
        <PoseCanvas ref={canvas} ex={ex} demo={mode === 'demo'} />
        <div className="hud-top">
          <button className="hud-btn" onClick={onCancel} aria-label="Stop and go back"><Close /></button>
          <div className="counter" aria-live="polite">
            <b className="num">{live?.repsDone ?? 0}</b>
            <span className="num">of {targetReps} reps · set {setIndex + 1}</span>
          </div>
          <button className="hud-btn" onClick={() => setVoiceOn(!voiceOn)} aria-label={voiceOn ? 'Turn voice off' : 'Turn voice on'}>
            {voiceOn ? <Speaker /> : <Mute />}
          </button>
        </div>
        {status === 'loading' && <div className="loading"><p>{mode === 'camera' ? 'Starting the camera and pose tracker…' : 'Starting demo…'}</p></div>}
        {status === 'error' && (
          <div className="loading">
            <div className="stack" style={{ maxWidth: 360 }}>
              <p>{error}</p>
              <button className="btn primary" onClick={onCancel}>Go back</button>
            </div>
          </div>
        )}
        {status === 'running' && flash && <div className="flash" role="status">{flash}</div>}
        {status === 'running' && <div className={`status ${b.cls}`} role="status">{b.text}</div>}
        {mode === 'demo' && status === 'running' && (
          <span className="badge" style={{ position: 'absolute', left: 12, bottom: 12 }}>Demo: simulated person</span>
        )}
      </div>
      <div className="panel">
        <div className="row">
          <div className="angle-read">
            <span className="small" style={{ opacity: 0.8 }}>{ex.primary.label}</span>{' '}
            <b className="num">{live && Number.isFinite(live.angle) ? Math.round(live.angle) : '–'}°</b>
          </div>
          <div className="legend">
            <span><i style={{ background: '#7fd6cb' }} />Guide</span>
            <span><i style={{ background: '#fb923c' }} />You</span>
          </div>
        </div>
        <TrajectoryChart ex={ex} live={live?.currentRep ?? []} guideT={live?.currentRep.length ? live.currentRep[live.currentRep.length - 1][0] : undefined} ghost={ghost} />
        <button className="btn" style={{ background: '#1c2e33', color: '#fff' }} onClick={endNow}>End set now</button>
      </div>
    </div>
  );
}
