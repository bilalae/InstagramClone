/** Best-effort local preview. Failure never blocks publishing the original video. */
export function videoThumbnail(file: File): Promise<File | null> {
  if (!file.type.startsWith("video/")) return Promise.resolve(null);
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    let done = false;
    const finish = (result: File | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.pause();
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const timer = setTimeout(() => finish(null), 8000);
    video.muted = true;
    video.preload = "auto";
    video.playsInline = true;
    video.onerror = () => finish(null);
    video.onloadeddata = () => {
      if (video.duration > 0.2)
        video.currentTime = Math.min(0.2, video.duration / 2);
      else capture();
    };
    const capture = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 480;
        canvas.height = Math.max(
          1,
          Math.round((video.videoHeight / video.videoWidth) * 480),
        );
        const context = canvas.getContext("2d");
        if (!context || !video.videoWidth) {
          finish(null);
          return;
        }
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) =>
            finish(
              blob
                ? new File([blob], "thumbnail.jpg", { type: "image/jpeg" })
                : null,
            ),
          "image/jpeg",
          0.8,
        );
      } catch {
        finish(null);
      }
    };
    video.onseeked = capture;
    video.src = url;
  });
}
