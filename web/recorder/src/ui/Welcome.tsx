// First-run setup: name and class, camera/mic, save folder, install.

import { useState } from 'react';

export function Welcome(props: {
  name: string;
  role: string;
  onNames: (name: string, role: string) => void;
  camOk: boolean;
  micOk: boolean;
  onAllow: () => Promise<void>;
  folderName: string | null;
  onFolder: () => void;
  canInstall: boolean;
  installed: boolean;
  onInstall: () => void;
  onDone: () => void;
}) {
  const { onNames, camOk, micOk, onAllow, folderName, onFolder, canInstall, installed, onInstall, onDone } = props;
  const [step, setStep] = useState(0);
  const [name, setName] = useState(props.name);
  const [role, setRole] = useState(props.role);
  const last = 4;
  const next = () => {
    if (step === 1) onNames(name.trim(), role.trim());
    if (step === last) onDone();
    else setStep(step + 1);
  };
  const labels = ['Get started', 'Next', camOk && micOk ? 'Next' : 'Skip for now', folderName ? 'Next' : 'Skip for now', 'Open the recorder'];

  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-label="Welcome to Recorder">
      <i className="w-shape a" aria-hidden="true" />
      <i className="w-shape b" aria-hidden="true" />
      <i className="w-shape c" aria-hidden="true" />
      <div className="w-inner">
        <div className="w-dots" role="progressbar" aria-valuemin={1} aria-valuemax={last + 1} aria-valuenow={step + 1} aria-label="Setup progress">
          {Array.from({ length: last + 1 }, (_, i) => (
            <i key={i} className={i === step ? 'on' : i < step ? 'done' : ''} />
          ))}
          <span className="note">
            Step {step + 1} of {last + 1}
          </span>
        </div>

        <div className="w-panel" key={step}>
          {step === 0 && (
            <>
              <div className="w-kicker">WELCOME TO RECORDER</div>
              <h1 className="w-hero">Make lesson videos your students want to watch.</h1>
              <p className="w-lead">Record your screen, your slides and yourself, switch scenes live, and save straight to your computer. Setup takes about a minute.</p>
            </>
          )}
          {step === 1 && (
            <>
              <h1 className="w-h1">What should your videos call you?</h1>
              <p className="w-lead">Used on title cards and name bars. You can change it any time.</p>
              <label className="field">
                Your name
                <input autoFocus placeholder="Optional" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="field">
                Class or subject
                <input placeholder="Optional" value={role} onChange={(e) => setRole(e.target.value)} />
              </label>
            </>
          )}
          {step === 2 && (
            <>
              <h1 className="w-h1">Let Recorder see and hear you</h1>
              <p className="w-lead">Chrome asks once for each. Everything stays on this computer.</p>
              {[
                ['Camera', 'For your face cam and effects like background blur.', camOk],
                ['Microphone', 'For your voice. Noise suppression is on by default.', micOk],
              ].map(([t, n, ok]) => (
                <div key={String(t)} className="tile">
                  <div className="tile-main">
                    <div className="tile-title">{t}</div>
                    <div className="note">{n}</div>
                  </div>
                  <span className={`w-status ${ok ? 'ok' : ''}`}>{ok ? 'Allowed ✓' : 'Not yet'}</span>
                </div>
              ))}
              {!(camOk && micOk) && (
                <button className="small-btn press" type="button" onClick={onAllow}>
                  Allow camera and microphone
                </button>
              )}
              <div className="note">Screen sharing is asked each time you share, so you always choose what is shown.</div>
            </>
          )}
          {step === 3 && (
            <>
              <h1 className="w-h1">Where should videos be saved?</h1>
              <p className="w-lead">Pick a folder once. Every recording lands there automatically.</p>
              <button type="button" className={`w-folder press ${folderName ? 'chosen' : ''}`} onClick={onFolder}>
                <b>{folderName ?? 'Choose a folder'}</b>
                <span>{folderName ? 'Chosen. Click to change.' : 'Chrome remembers it, so you only do this once.'}</span>
              </button>
            </>
          )}
          {step === 4 && (
            <>
              <h1 className="w-h1">You’re ready. Two quick tips.</h1>
              <div className="w-tips">
                <div className="card">
                  <div className="tile-title">Install it as an app</div>
                  <div className="note">Its own window and icon, and it works offline.</div>
                  {installed ? (
                    <span className="w-status ok">Installed ✓</span>
                  ) : canInstall ? (
                    <button className="small-btn press" type="button" onClick={onInstall}>
                      Install Recorder
                    </button>
                  ) : (
                    <div className="note">Use the install icon at the right end of Chrome’s address bar.</div>
                  )}
                </div>
                <div className="card">
                  <div className="tile-title">Teach from any app</div>
                  <div className="note">Pop out the mini window to switch scenes and stop recording while you’re in Slides, PowerPoint or a website.</div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="w-nav">
          {step > 0 && (
            <button className="text-btn press" type="button" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className="w-next press" type="button" onClick={next}>
            {labels[step]}
          </button>
        </div>
      </div>
    </div>
  );
}
