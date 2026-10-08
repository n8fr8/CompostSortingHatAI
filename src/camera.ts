export function startCamera() {
  // start the camera and pump the video into the #cameraCanvas canvas

  const video = document.querySelector("video") as HTMLVideoElement;

  const videoConstraints = {};
  videoConstraints.deviceId = '18ae045f79afaa627b4de05b52368f46ec4bd328b240b116276e7aa6a81ff0f1';

//videoinput: Logitech BRIO (046d:085e) id = 18ae045f79afaa627b4de05b52368f46ec4bd328b240b116276e7aa6a81ff0f1

  navigator.mediaDevices.enumerateDevices()
    .then((devices) => {
      devices.forEach((device) => {
        console.log(`${device.kind}: ${device.label} id = ${device.deviceId}`);
      });
    })
    .catch((err) => {
      console.error(`${err.name}: ${err.message}`);
    });

  navigator.mediaDevices
    .getUserMedia({
      audio: true,
      video: videoConstraints,
    })
    .then((stream) => {
      video.srcObject = stream;
      video.play();

      copyToCanvas();
    })
    .catch(function (e) {
      if (
        confirm(
          "An error with camera occured:(" + e.name + ") Do you want to reload?"
        )
      ) {
        location.reload();
      }
    });
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
