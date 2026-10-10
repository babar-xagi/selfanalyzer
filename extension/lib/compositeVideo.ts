export type CameraLayout = 'corner' | 'large' | 'focus';

/** Draw the shared screen and the user's camera into one downloadable video track. */
export async function compositeScreenAndCamera(screen: MediaStream, camera: MediaStream, getLayout: () => CameraLayout): Promise<{ stream: MediaStream; stop: () => void }> {
  const tabVideo = document.createElement('video');
  const cameraVideo = document.createElement('video');
  for (const [element, source] of [[tabVideo, screen], [cameraVideo, camera]] as const) {
    element.muted = true;
    element.playsInline = true;
    element.srcObject = source;
  }
  // An inactive shared tab may not deliver its first frame until the recorder
  // starts and Chrome returns to that tab. Do not wait indefinitely here.
  await Promise.race([
    Promise.all([tabVideo.play(), cameraVideo.play()]),
    new Promise<void>((resolve) => window.setTimeout(resolve, 1000)),
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 900;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Chrome could not combine the shared screen and camera.');

  const draw = () => {
    context.fillStyle = '#0b1015';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const screenReady = tabVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && tabVideo.videoWidth && tabVideo.videoHeight;
    const cameraReady = cameraVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && cameraVideo.videoWidth && cameraVideo.videoHeight;
    const layout = getLayout();
    if (screenReady && layout !== 'focus') {
      const ratio = Math.min(canvas.width / tabVideo.videoWidth, canvas.height / tabVideo.videoHeight);
      const width = tabVideo.videoWidth * ratio;
      const height = tabVideo.videoHeight * ratio;
      context.drawImage(tabVideo, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    }
    if (cameraReady) {
      const width = layout === 'focus' ? canvas.width : layout === 'large' ? 640 : 360;
      const height = layout === 'focus' ? canvas.height : layout === 'large' ? 360 : 203;
      const x = layout === 'focus' ? 0 : canvas.width - width - 24;
      const y = layout === 'focus' ? 0 : canvas.height - height - 24;
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
    if (screenReady && layout === 'focus') {
      const width = 360;
      const height = 203;
      const x = canvas.width - width - 24;
      const y = canvas.height - height - 24;
      context.fillStyle = '#0b1015';
      context.fillRect(x - 4, y - 4, width + 8, height + 8);
      const ratio = Math.min(width / tabVideo.videoWidth, height / tabVideo.videoHeight);
      const fitWidth = tabVideo.videoWidth * ratio;
      const fitHeight = tabVideo.videoHeight * ratio;
      context.drawImage(tabVideo, x + (width - fitWidth) / 2, y + (height - fitHeight) / 2, fitWidth, fitHeight);
    }
  };
  draw();
  let tabFrameRequest = 0;
  let cameraFrameRequest = 0;
  const onTabFrame: VideoFrameRequestCallback = () => {
    draw();
    tabFrameRequest = tabVideo.requestVideoFrameCallback(onTabFrame);
  };
  const onCameraFrame: VideoFrameRequestCallback = () => {
    draw();
    cameraFrameRequest = cameraVideo.requestVideoFrameCallback(onCameraFrame);
  };
  tabFrameRequest = tabVideo.requestVideoFrameCallback(onTabFrame);
  cameraFrameRequest = cameraVideo.requestVideoFrameCallback(onCameraFrame);
  const timer = window.setInterval(draw, 200);
  const stream = canvas.captureStream(30);
  return {
    stream,
    stop: () => {
      window.clearInterval(timer);
      tabVideo.cancelVideoFrameCallback(tabFrameRequest);
      cameraVideo.cancelVideoFrameCallback(cameraFrameRequest);
      stream.getTracks().forEach((track) => track.stop());
      tabVideo.pause();
      cameraVideo.pause();
      tabVideo.srcObject = null;
      cameraVideo.srcObject = null;
    },
  };
}
