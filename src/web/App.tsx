import { useState } from 'react';
import type { RecordedSet } from '../core/export';
import { recordSet, type RecordResult } from '../core/progress';
import type { SetResult } from '../core/session';
import { getExercise } from '../exercises';
import { Chart, Cog, Home as HomeIcon } from './components/Icons';
import { Home, setsDoneToday } from './screens/Home';
import { Intro } from './screens/Intro';
import { Progress } from './screens/Progress';
import { Settings } from './screens/Settings';
import { Summary } from './screens/Summary';
import { Workout } from './screens/Workout';
import { today, useAppState } from './state';

type Screen =
  | { name: 'home' }
  | { name: 'progress' }
  | { name: 'settings' }
  | { name: 'intro'; exerciseId: string }
  | { name: 'workout'; exerciseId: string; setIndex: number; mode: 'camera' | 'demo' }
  | { name: 'summary'; exerciseId: string; setIndex: number; mode: 'camera' | 'demo'; result: SetResult; record: RecordResult; recorded?: RecordedSet };

export function App() {
  const app = useAppState();
  const [screen, setScreen] = useState<Screen>({ name: 'home' });

  const finishSet = (s: Extract<Screen, { name: 'workout' }>, result: SetResult) => {
    const record = recordSet(
      app.progress,
      { exerciseId: result.exerciseId, reps: result.reps.length, score: result.setScore, at: result.endedAt },
      today(),
    );
    app.setProgress(record.state);
    let recorded: RecordedSet | undefined;
    if (app.settings.dataCollection && result.reps.length) {
      recorded = { setId: `${result.exerciseId}-${result.startedAt}`, source: s.mode, result };
      app.addRecording(recorded);
    }
    setScreen({ name: 'summary', exerciseId: s.exerciseId, setIndex: s.setIndex, mode: s.mode, result, record, recorded });
    window.scrollTo(0, 0);
  };

  if (screen.name === 'workout') {
    return (
      <Workout
        key={`${screen.exerciseId}-${screen.setIndex}-${screen.mode}`}
        app={app}
        exerciseId={screen.exerciseId}
        setIndex={screen.setIndex}
        mode={screen.mode}
        onDone={(r) => finishSet(screen, r)}
        onCancel={() => setScreen({ name: 'intro', exerciseId: screen.exerciseId })}
      />
    );
  }

  if (screen.name === 'intro') {
    return (
      <Intro
        app={app}
        exerciseId={screen.exerciseId}
        onBack={() => setScreen({ name: 'home' })}
        onStart={(mode) => setScreen({ name: 'workout', exerciseId: screen.exerciseId, setIndex: setsDoneToday(app, screen.exerciseId), mode })}
      />
    );
  }

  if (screen.name === 'summary') {
    const ex = getExercise(screen.exerciseId)!;
    const more = screen.setIndex + 1 < ex.plan.sets;
    return (
      <Summary
        result={screen.result}
        record={screen.record}
        setIndex={screen.setIndex}
        recorded={screen.recorded}
        onNext={more ? () => setScreen({ name: 'workout', exerciseId: ex.id, setIndex: screen.setIndex + 1, mode: screen.mode }) : undefined}
        onDone={() => setScreen({ name: 'home' })}
      />
    );
  }

  const tab = screen.name;
  return (
    <>
      {tab === 'home' && <Home app={app} onPick={(id) => setScreen({ name: 'intro', exerciseId: id })} />}
      {tab === 'progress' && <Progress app={app} />}
      {tab === 'settings' && <Settings app={app} />}
      <nav className="tabs" aria-label="Main">
        <div className="tabs-inner">
          <button className="tab" aria-current={tab === 'home' ? 'page' : undefined} onClick={() => setScreen({ name: 'home' })}><HomeIcon />Today</button>
          <button className="tab" aria-current={tab === 'progress' ? 'page' : undefined} onClick={() => setScreen({ name: 'progress' })}><Chart />Progress</button>
          <button className="tab" aria-current={tab === 'settings' ? 'page' : undefined} onClick={() => setScreen({ name: 'settings' })}><Cog />Settings</button>
        </div>
      </nav>
    </>
  );
}
