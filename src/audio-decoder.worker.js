// Web Worker: decodes audio off the main renderer heap
self.onmessage = async function(e) {
  const { arrayBuffer, sampleRate } = e.data;
  try {
    const ctx = new OfflineAudioContext(2, 1, sampleRate || 44100);
    // decodeAudioData on a minimal context just to get the decoded buffer
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    // Transfer channel data back as transferable ArrayBuffers
    const channels = [];
    const buffers = [];
    for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
      const data = decoded.getChannelData(ch).buffer.slice(0);
      channels.push(data);
      buffers.push(data);
    }
    self.postMessage({
      ok: true,
      numberOfChannels: decoded.numberOfChannels,
      sampleRate: decoded.sampleRate,
      length: decoded.length,
      duration: decoded.duration,
      channels
    }, buffers);
  } catch(err) {
    self.postMessage({ ok: false, error: err.message || String(err) });
  }
};
