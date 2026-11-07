import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useLowPower } from '../context/LowPowerContext';
import { stagger } from '../utils/landingMotion';
import { LandingMorphStage } from './LandingModeCards';

const easeOut = [0.22, 1, 0.36, 1];

const wordUp = {
  hidden: { opacity: 0, y: 32 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.72, ease: easeOut },
  },
};

const wordFade = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
};

export function LandingHero({
  connected,
  isJoining,
  onStart,
  onStartChat,
  counts = {},
}) {
  const reduce = useReducedMotion();
  const { lowPower } = useLowPower();
  const pinRef = useRef(null);
  const stickyRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: pinRef,
    offset: ['start start', 'end end'],
  });
  const morph = useTransform(scrollYProgress, [0.1, 0.82], [0, 1]);
  const [cardsOn, setCardsOn] = useState(!!reduce);

  useMotionValueEvent(morph, 'change', (value) => {
    setCardsOn(value >= 0.48);
  });

  useEffect(() => {
    if (reduce) setCardsOn(true);
  }, [reduce]);

  useEffect(() => {
    const pin = pinRef.current;
    const sticky = stickyRef.current;
    if (!pin || !sticky || reduce) return undefined;

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = pin.getBoundingClientRect();
      const vh = window.innerHeight;
      sticky.classList.remove('is-fixed', 'is-end');
      if (rect.top <= 0 && rect.bottom > vh) {
        sticky.classList.add('is-fixed');
      } else if (rect.top < 0 && rect.bottom <= vh) {
        sticky.classList.add('is-end');
      }
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [reduce]);


  const startVideo = () => {
    if (onStartChat) onStartChat();
    else onStart?.('video');
  };

  const morphStyle = reduce ? { '--lv4-morph': 1 } : { '--lv4-morph': morph };
  const words = reduce ? wordFade : wordUp;
  const stillOrb = reduce || lowPower;

  return (
    <section
      ref={pinRef}
      className={`lv4-pin${reduce ? ' lv4-pin--static' : ''}`}
      data-landing-pin=""
    >
      <div className="lv4-pin__sticky" ref={stickyRef}>
        <div className="lv4-hero">
          <div className="lv4-orb-wrap" aria-hidden>
            {stillOrb ? (
              <div className="lv4-orb lv4-orb--static" />
            ) : (
              <motion.div
                className="lv4-orb"
                animate={{ x: [0, 16, -12, 0], y: [0, -12, 10, 0] }}
                transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
          </div>

          <div className="lv4-hero__copy">
            <motion.h1
              className="lv4-hero__title"
              initial="hidden"
              animate="visible"
              variants={stagger(0.12, 0.06)}
            >
              <motion.span className="lv4-hero__strangers" variants={words}>
                Strangers,
              </motion.span>
              <motion.span className="lv4-hero__meet" variants={words}>
                meet.
              </motion.span>
            </motion.h1>
            <motion.p
              className="lv4-hero__sub"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.28, ease: easeOut }}
            >
              Anonymous video, text, group and voice. No sign-up, no nickname.
            </motion.p>
            <div className="lv4-hero__actions">
              <button
                type="button"
                className="lv4-cta"
                disabled={!connected || isJoining}
                onClick={startVideo}
              >
                Start chatting
                <span aria-hidden>→</span>
              </button>
            </div>
            {!connected && (
              <p className="lv4-hero__status">Connecting to servers…</p>
            )}
            {connected && isJoining && (
              <p className="lv4-hero__status">Joining…</p>
            )}
          </div>

          <LandingMorphStage
            morphStyle={morphStyle}
            cardsOn={cardsOn || !!reduce}
            onStart={onStart}
            connected={connected}
            isJoining={isJoining}
            counts={counts}
          />

          <p className="lv4-moderation">Moderated 24/7 · 18+</p>
        </div>
      </div>
    </section>
  );
}

export default LandingHero;
