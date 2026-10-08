const SCALE_FACTOR = 1;

export function scaleAndStackImagesAndGetBase64(images: HTMLImageElement[]) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  // only the most recent decoded frame is sent, so size the canvas for one frame
  const latest = [...images].reverse().find((img) => img.complete && img.naturalWidth > 0) ?? images[images.length - 1];
  const width = latest.width;
  const height = latest.height;

  canvas.width = width * SCALE_FACTOR;
  canvas.height = height * SCALE_FACTOR;

/**
  images.forEach((image, index) => {
    context.drawImage(
      image,
      0,
      index * height * SCALE_FACTOR,
      width * SCALE_FACTOR,
      height * SCALE_FACTOR
    );
  });
**/
    context.drawImage(
      latest,
      0,
      0,
      width * SCALE_FACTOR,
      height * SCALE_FACTOR
    );

  return canvas.toDataURL("image/jpeg");
}
