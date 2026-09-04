import { useEffect, useState } from 'react';
import LivesFeed from './LivesFeed';
import LiveViewer from './LiveViewer';
import LiveStudio from './LiveStudio';
import { getCreatorSessionToken } from '../../utils/creatorAuth';
import { useCreators } from '../../hooks/useCreators';

/**
 * Lives mode shell: feed → viewer, or creator Create Live studio.
 */
export default function LivesApp({
  socket,
  identityHook,
  isCreator = false,
  onExit,
  initialCreateLive = false,
}) {
  const creatorsHook = useCreators();
  const sessionTok = !!getCreatorSessionToken();
  const approvedCreator = creatorsHook.creatorStatus?.status === 'approved';
  // Show Create Live while status loads if session exists; after load, approved only.
  const canHost = sessionTok && (creatorsHook.loading || approvedCreator);

  const [view, setView] = useState(() => (initialCreateLive ? 'studio' : 'feed'));
  const [liveId, setLiveId] = useState(null);

  useEffect(() => {
    if (initialCreateLive) setView('studio');
  }, [initialCreateLive]);

  if (view === 'studio') {
    return (
      <LiveStudio
        socket={socket}
        identityHook={identityHook}
        creatorsHook={creatorsHook}
        onExit={() => {
          if (initialCreateLive) onExit?.();
          else setView('feed');
        }}
        onStarted={(live) => {
          setLiveId(live.id);
        }}
      />
    );
  }

  if (view === 'watch' && liveId) {
    return (
      <LiveViewer
        socket={socket}
        identityHook={identityHook}
        initialLiveId={liveId}
        onExit={() => {
          setLiveId(null);
          setView('feed');
        }}
      />
    );
  }

  return (
    <LivesFeed
      identityHook={identityHook}
      isCreator={isCreator || canHost}
      canCreateLive={canHost}
      onExit={onExit}
      onGoLive={() => setView('studio')}
      onOpenLive={(id) => {
        setLiveId(id);
        setView('watch');
      }}
    />
  );
}
