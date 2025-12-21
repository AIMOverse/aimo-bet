import { cn } from "@/lib/utils";

export interface VideoProps {
  /** URL of the video */
  url: string;
  /** MIME type of the video (e.g., "video/mp4") */
  mediaType?: string;
  /** Additional CSS classes */
  className?: string;
  /** Whether to autoplay the video */
  autoPlay?: boolean;
  /** Whether to loop the video */
  loop?: boolean;
  /** Whether to mute the video */
  muted?: boolean;
}

export const Video = ({
  url,
  mediaType = "video/mp4",
  className,
  autoPlay = false,
  loop = false,
  muted = false,
}: VideoProps) => (
  <video
    src={url}
    controls
    autoPlay={autoPlay}
    loop={loop}
    muted={muted}
    playsInline
    className={cn(
      "h-auto max-w-full overflow-hidden rounded-md",
      className,
    )}
  >
    <source src={url} type={mediaType} />
    Your browser does not support the video tag.
  </video>
);
