/** Replace outgoing video tracks on every RTCPeerConnection sender. */
export async function replaceOutgoingVideoTracks(peerConnections, videoTrack) {
  if (!videoTrack) return;
  const tasks = [];
  peerConnections.forEach((pc) => {
    if (pc.signalingState === 'closed') return;
    const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
    if (sender) tasks.push(sender.replaceTrack(videoTrack).catch(() => {}));
  });
  await Promise.all(tasks);
}
