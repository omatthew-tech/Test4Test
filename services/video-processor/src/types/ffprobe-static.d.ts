declare module "ffprobe-static" {
  /** Absolute path to the bundled ffprobe binary for the current platform. */
  const ffprobe: { path: string };
  export default ffprobe;
}
