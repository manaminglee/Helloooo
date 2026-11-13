import { motion, useReducedMotion } from 'framer-motion';
import { LandingMorphStage } from './LandingModeCards';

const spring = { type: 'spring', stiffness: 380, damping: 28 };

const STEPS = [
  { n: '01', title: 'Pick a room', body: 'Video, text, a group of 4, voice, or a live.' },
  { n: '02', title: 'We match you', body: 'Anonymous by default. Interests are optional.' },
  { n: '03', title: 'Leave anytime', body: 'Skip, report, or close. Nothing is saved.' },
];

export function LandingHero({
  connected,
  isJoining,
  onStart,
  onStartChat,
  counts = {},
}) {
  const reduce = useReducedMotion();

  const startVideo = () => {
    if (onStartChat) onStartChat();
    else onStart?.('video');
  };

  return (
    <section className="studio" data-landing-pin="">
      <div className="studio-copy">
        <motion.p
          className="studio-kicker"
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0.01 } : spring}
        >
          <span className="studio-kicker__dot" aria-hidden />
          Live now · moderated 24/7 · 18+
        </motion.p>
        <motion.h1
          className="studio-title"
          initial={reduce ? false : { opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0.01 } : { ...spring, delay: 0.05 }}
        >
          Say hello
          <em>to someone new.</em>
        </motion.h1>
        <motion.p
          className="studio-lead"
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0.01 } : { ...spring, delay: 0.1 }}
        >
          A private place for face-to-face video, quiet text, small groups, and drop-in voice. No account, no history.
        </motion.p>
        <div className="studio-actions">
          <motion.button
            type="button"
            className="studio-cta"
            disabled={!connected || isJoining}
            onClick={startVideo}
            whileHover={reduce || !connected || isJoining ? undefined : { scale: 1.04, y: -2 }}
            whileTap={reduce || !connected || isJoining ? undefined : { scale: 0.97 }}
            transition={spring}
          >
            Start chatting
          </motion.button>
          {!connected && <p className="studio-status">Connecting to servers…</p>}
          {connected && isJoining && <p className="studio-status">Joining…</p>}
        </div>
      </div>

      <LandingMorphStage
        onStart={onStart}
        connected={connected}
        isJoining={isJoining}
        counts={counts}
      />

      <motion.ol
        className="studio-steps"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-40px' }}
        variants={reduce ? undefined : { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
      >
        {STEPS.map((step) => (
          <motion.li
            key={step.n}
            className="studio-step"
            variants={reduce ? undefined : {
              hidden: { opacity: 0, y: 18 },
              visible: { opacity: 1, y: 0, transition: spring },
            }}
          >
            <span className="studio-step__n">{step.n}</span>
            <div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          </motion.li>
        ))}
      </motion.ol>
    </section>
  );
}

export default LandingHero;
