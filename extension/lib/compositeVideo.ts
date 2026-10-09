/** Draw the captured tab and the user's camera into one downloadable video track. */
export async function compositeTabAndCamera(tab: MediaStream, camera: MediaStream): Promise<{ stream: MediaStream; stop: () => void }> {
  const tabVideo = document.createElement('video');
  const cameraVideo = document.createElement('video');
  for (const [element, source] of [[tabVideo, tab], [cameraVideo, camera]] as const) {
    element.muted = true;
    element.playsInline = true;
    element.srcObject = source;
  }
  await Promise.all([tabVideo.play(), cameraVideo.play()]);
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 900;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Chrome could not combine the ChatGPT tab and camera.');

  const draw = () => {
    context.fillStyle = '#0b1015';
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (tabVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && tabVideo.videoWidth && tabVideo.videoHeight) {
      const ratio = Math.min(canvas.width / tabVideo.videoWidth, canvas.height / tabVideo.videoHeight);
      const width = tabVideo.videoWidth * ratio;
      const height = tabVideo.videoHeight * ratio;
      context.drawImage(tabVideo, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    }
    if (cameraVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && cameraVideo.videoWidth && cameraVideo.videoHeight) {
      const width = 360;
      const height = 203;
      const x = canvas.width - width - 24;
      const y = canvas.height - height - 24;
      context.fillStyle = '#0b1015';
      context.fillRect(x - 4, y - 4, width + 8, height + 8);
      const sourceRatio = cameraVideo.videoWidth / cameraVideo.videoHeight;
      const targetRatio = width / height;
      const sourceWidth = sourceRatio > targetRatio ? cameraVideo.videoHeight * targetRatio : cameraVideo.videoWidth;
      const sourceHeight = sourceRatio > targetRatio ? cameraVideo.videoHeight : cameraVideo.videoWidth / targetRatio;
      context.drawImage(cameraVideo,
        (cameraVideo.videoWidth - sourceWidth) / 2, (cameraVideo.videoHeight - sourceHeight) / 2,
        sourceWidth, sourceHeight, x, y, width, height);
    }
  };
  draw();
  let frameRequest = 0;
  const onTabFrame: VideoFrameRequestCallback = () => {
    draw();
    frameRequest = tabVideo.requestVideoFrameCallback(onTabFrame);
  };
  frameRequest = tabVideo.requestVideoFrameCallback(onTabFrame);
  const timer = window.setInterval(draw, 250);
  const stream = canvas.captureStream(30);
  return {
    stream,
    stop: () => {
      window.clearInterval(timer);
      tabVideo.cancelVideoFrameCallback(frameRequest);
      stream.getTracks().forEach((track) => track.stop());
      tabVideo.pause();
      cameraVideo.pause();
      tabVideo.srcObject = null;
      cameraVideo.srcObject = null;
    },
  };
}
