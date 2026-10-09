// Labels that usually identify a laptop's built-in webcam.
const BUILT_IN_CAMERA = /laptop|integrated|built-in|internal|facetime|front|back|rear/i;

// Optional override: part of the camera label to prefer, e.g. "BRIO".
const PREFERRED_CAMERA = import.meta.env.VITE_CAMERA_LABEL as string | undefined;

async function pickCamera(): Promise<string | undefined> {
  // device labels are only exposed once camera permission has been granted
  const probe = await navigator.mediaDevices.getUserMedia({ video: true });
  probe.getTracks().forEach((track) => track.stop());

  const cameras = (await navigator.mediaDevices.enumerateDevices()).filter(
    (device) => device.kind === "videoinput"
  );
  cameras.forEach((camera) =>
    console.log(`videoinput: ${camera.label} id = ${camera.deviceId}`)
  );

  const preferred =
    (PREFERRED_CAMERA &&
      cameras.find((camera) =>
        camera.label.toLowerCase().includes(PREFERRED_CAMERA.toLowerCase())
      )) ||
    // external cameras are usually enumerated after the built-in one
    [...cameras].reverse().find((camera) => !BUILT_IN_CAMERA.test(camera.label)) ||
    cameras[0];

  console.log(`using camera: ${preferred?.label}`);
  return preferred?.deviceId;
}

export async function startCamera() {
  // start the camera and pump the video into the #cameraCanvas canvas

  const video = document.querySelector("video") as HTMLVideoElement;

  try {
    const deviceId = await pickCamera();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: deviceId ? { deviceId: { exact: deviceId } } : true,
    });
    video.srcObject = stream;
    video.play();

    copyToCanvas();
  } catch (e: any) {
    if (
      confirm(
        "An error with camera occured:(" + e.name + ") Do you want to reload?"
      )
    ) {
      location.reload();
    }
  }
}

function copyToCanvas() {
  const video = document.querySelector("video") as HTMLVideoElement;
  const canvas = document.querySelector("canvas") as HTMLCanvasElement;

  const context = canvas.getContext("2d")!;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  requestAnimationFrame(copyToCanvas);
}

export function stopCamera() {
  // stop the camera
  const video = document.querySelector("video") as HTMLVideoElement;
  const stream = video.srcObject as MediaStream;
  const tracks = stream.getTracks();

  tracks.forEach(function (track) {
    track.stop();
  });

  video.srcObject = null;
}
