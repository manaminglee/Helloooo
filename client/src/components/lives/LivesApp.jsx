import { useState } from 'react';
import LivesFeed from './LivesFeed';
import LiveViewer from './LiveViewer';
import LiveStudio from './LiveStudio';

/**
 * Lives mode shell: feed → viewer swipe, or creator studio.
 */
export default function LivesApp({
  socket,
  identityHook,
  isCreator = false,
  onExit,
}) {
  const [view, setView] = useState('feed'); // feed | watch | studio
  const [liveId, setLiveId] = useState(null);

  if (view === 'studio') {
    return (
      <LiveStudio
        socket={socket}
        onExit={() => setView('feed')}
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
      isCreator={isCreator}
      onExit={onExit}
      onGoLive={() => setView('studio')}
      onOpenLive={(id) => {
        setLiveId(id);
        setView('watch');
      }}
    />
  );
}
