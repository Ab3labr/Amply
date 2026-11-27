export interface YouTubePlayer {
  destroy(): void;
  getCurrentTime(): number;
  getDuration(): number;
  getVideoData(): { video_id?: string };
  setVolume(volume: number): void;
  loadVideoById(videoId: string | { videoId: string; startSeconds?: number }): void;
  cueVideoById(videoId: string | { videoId: string; startSeconds?: number }): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  mute(): void;
  unMute(): void;
}

export interface YouTubePlayerEvent {
  target: YouTubePlayer;
  data: number;
}

interface YouTubePlayerConfig {
  height: string;
  width: string;
  videoId?: string;
  playerVars: Record<string, number>;
  events: {
    onReady?: (event: YouTubePlayerEvent) => void;
    onStateChange?: (event: YouTubePlayerEvent) => void;
    onError?: (event: YouTubePlayerEvent) => void;
  };
}

export interface YouTubeNamespace {
  Player: new (target: string | HTMLElement, config: YouTubePlayerConfig) => YouTubePlayer;
  PlayerState: {
    UNSTARTED: -1;
    ENDED: 0;
    PLAYING: 1;
    PAUSED: 2;
    BUFFERING: 3;
    CUED: 5;
  };
}

let apiPromise: Promise<YouTubeNamespace> | null = null;

export function getYouTubeNamespace(): YouTubeNamespace | undefined {
  return (window as Window & { YT?: YouTubeNamespace }).YT;
}

export function loadYouTubeIframeApi(): Promise<YouTubeNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("The YouTube IFrame API is only available in a browser."));
  }
  const browserWindow = window as Window & {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  };
  if (browserWindow.YT) return Promise.resolve(browserWindow.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YouTubeNamespace>((resolve, reject) => {
    const previousCallback = browserWindow.onYouTubeIframeAPIReady;
    const handleReady = () => {
      try {
        previousCallback?.();
      } finally {
        if (browserWindow.YT) {
          resolve(browserWindow.YT);
        } else {
          apiPromise = null;
          reject(new Error("The YouTube IFrame API callback ran without an API instance."));
        }
      }
    };
    browserWindow.onYouTubeIframeAPIReady = handleReady;

    let script = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    if (!script) {
      script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.head.appendChild(script);
    }

    script.addEventListener(
      "error",
      () => {
        if (browserWindow.onYouTubeIframeAPIReady === handleReady) {
          browserWindow.onYouTubeIframeAPIReady = previousCallback;
        }
        apiPromise = null;
        reject(new Error("Failed to load the YouTube IFrame API script."));
      },
      { once: true }
    );
  });

  return apiPromise;
}
