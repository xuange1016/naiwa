import { access, copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";

const usage = `
Usage:
  npm run assets:action -- <input-video> <action-id> [options]

Examples:
  npm run assets:action -- assets/wave.mp4 wave --name "打招呼"
  npm run assets:action -- assets/dance.mp4 dance --name "跳舞" --key-color 0xffffff --overwrite

Options:
  --name <text>          Display name for the action. Defaults to the action ID.
  --fps <number>         Output frames per second. Default: 30.
  --width <number>       Output width. Default: 720.
  --height <number>      Output height. Default: 960.
  --key-color <hex>      Background colour to remove. Default: 0xffffff (white).
  --background-mode <m>  "key", "edge-floodfill", "yellow-subject", "yellow-subject-grabcut", "yellow-subject-focused", or "rembg". Default: key.
  --similarity <number>  Chroma-key tolerance. Default: 0.08.
  --blend <number>       Chroma-key edge softness. Default: 0.03.
  --floodfill-value <n>  Minimum HSV brightness for edge-floodfill. Default: 165.
  --floodfill-saturation <n> Maximum HSV saturation for edge-floodfill. Default: 100.
  --webp-quality <n>     WebP quality from 0 to 100. Default: 82.
  --fallback-audio <path> Copy this audio when the source has no audio track.
  --overwrite            Replace an existing action directory.
`;

const parseArgs = (args) => {
  const options = {};
  const positional = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const [rawKey, rawValue] = arg.slice(2).split("=", 2);
    if (rawKey === "overwrite") {
      options.overwrite = true;
      continue;
    }

    const value = rawValue ?? args[index + 1];
    if (rawValue === undefined) {
      index += 1;
    }
    options[rawKey.replaceAll("-", "_")] = value;
  }

  return { positional, options };
};

const numberOption = (value, fallback, name) => {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number, received ${value}`);
  }

  return parsed;
};

const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with ${code}`));
      }
    });
  });

const capture = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "inherit"] });
    let output = "";

    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`${command} exited with ${code}`));
      }
    });
  });

const pathExists = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const { positional, options } = parseArgs(process.argv.slice(2));
const [input, actionId] = positional;

if (!input || !actionId || !/^[a-z0-9-]+$/i.test(actionId)) {
  throw new Error(`${usage}\n<action-id> must contain only letters, numbers, and hyphens.`);
}

const config = {
  id: actionId,
  name: options.name ?? actionId,
  fps: numberOption(options.fps, 30, "fps"),
  width: numberOption(options.width, 720, "width"),
  height: numberOption(options.height, 960, "height"),
  keyColor: options.key_color ?? "0xffffff",
  backgroundMode: options.background_mode ?? "key",
  similarity: numberOption(options.similarity, 0.08, "similarity"),
  blend: numberOption(options.blend, 0.03, "blend"),
  floodfillValue: numberOption(options.floodfill_value, 165, "floodfill-value"),
  floodfillSaturation: numberOption(options.floodfill_saturation, 100, "floodfill-saturation"),
  webpQuality: numberOption(options.webp_quality, 82, "webp-quality"),
  fallbackAudio: options.fallback_audio,
  overwrite: options.overwrite === true,
};

if (config.fps <= 0 || config.width <= 0 || config.height <= 0) {
  throw new Error("fps, width, and height must be greater than zero.");
}

if (config.webpQuality < 0 || config.webpQuality > 100) {
  throw new Error("webp-quality must be between 0 and 100.");
}

if (!["key", "edge-floodfill", "yellow-subject", "yellow-subject-grabcut", "yellow-subject-focused", "rembg"].includes(config.backgroundMode)) {
  throw new Error('background-mode must be "key", "edge-floodfill", "yellow-subject", "yellow-subject-grabcut", "yellow-subject-focused", or "rembg".');
}

if (
  config.floodfillValue < 0 ||
  config.floodfillValue > 255 ||
  config.floodfillSaturation < 0 ||
  config.floodfillSaturation > 255
) {
  throw new Error("floodfill-value and floodfill-saturation must be between 0 and 255.");
}

const output = join("public", "actions", config.id);
const framesDir = join(output, "frames");
const temporaryPngDir = join(output, ".tmp-png");

if (!(await pathExists(input))) {
  throw new Error(`Source video was not found: ${input}`);
}

if (config.fallbackAudio && !(await pathExists(config.fallbackAudio))) {
  throw new Error(`Fallback audio was not found: ${config.fallbackAudio}`);
}

if (await pathExists(output)) {
  if (!config.overwrite) {
    throw new Error(`Action directory already exists: ${output}\nUse --overwrite only if you intend to replace this action.`);
  }

  await rm(output, { recursive: true, force: true });
}

await mkdir(framesDir, { recursive: true });
await mkdir(temporaryPngDir, { recursive: true });

try {
  const hasAudio = (await capture("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "a:0",
    "-show_entries",
    "stream=index",
    "-of",
    "csv=p=0",
    input,
  ])).trim().length > 0;

  let audio = null;
  if (hasAudio) {
    await run("ffmpeg", [
      "-y",
      "-i",
      input,
      "-vn",
      "-map",
      "0:a:0",
      "-c:a",
      "aac",
      join(output, "audio.m4a"),
    ]);
    audio = "audio.m4a";
  } else if (config.fallbackAudio) {
    await copyFile(config.fallbackAudio, join(output, "audio.m4a"));
    audio = "audio.m4a";
  }

  const pngPattern = join(temporaryPngDir, "frame_%04d.png");
  const filter = [
    `fps=${config.fps}`,
    ...(config.backgroundMode === "key" ? [`colorkey=${config.keyColor}:${config.similarity}:${config.blend}`] : []),
    "format=rgba",
    `scale=${config.width}:${config.height}:force_original_aspect_ratio=decrease:flags=lanczos`,
    `pad=${config.width}:${config.height}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`,
    "format=rgba",
  ].join(",");

  await run("ffmpeg", [
    "-y",
    "-i",
    input,
    "-an",
    "-vf",
    filter,
    "-start_number",
    "0",
    pngPattern,
  ]);

  const pngFrames = (await readdir(temporaryPngDir)).filter((file) => file.endsWith(".png")).sort();
  for (const file of pngFrames) {
    const source = join(temporaryPngDir, file);
    const target = join(framesDir, file.replace(".png", ".webp"));

    if (["edge-floodfill", "yellow-subject", "yellow-subject-grabcut", "yellow-subject-focused", "rembg"].includes(config.backgroundMode)) {
      await run("python", [
        "scripts/remove-connected-background.py",
        source,
        source,
        "--mode",
        config.backgroundMode === "yellow-subject"
          ? "yellow-subject"
          : config.backgroundMode === "yellow-subject-grabcut"
            ? "yellow-subject-grabcut"
          : config.backgroundMode === "yellow-subject-focused"
            ? "yellow-subject-focused"
          : config.backgroundMode === "rembg"
            ? "rembg"
            : "edge-background",
        "--min-value",
        String(config.floodfillValue),
        "--max-saturation",
        String(config.floodfillSaturation),
      ]);
    }
    await run("cwebp", ["-quiet", "-q", String(config.webpQuality), source, "-o", target]);
  }

  const frameCount = (await readdir(framesDir)).filter((file) => file.endsWith(".webp")).length;
  if (frameCount === 0) {
    throw new Error("No frames were generated from the source video.");
  }

  const manifest = {
    id: config.id,
    name: config.name,
    width: config.width,
    height: config.height,
    fps: config.fps,
    frameCount,
    idleFrame: "frames/frame_0000.webp",
    framePattern: "frames/frame_{index}.webp",
    audio,
  };

  await writeFile(join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Generated action '${config.id}' with ${frameCount} transparent WebP frames in ${output}`);
} finally {
  await rm(temporaryPngDir, { recursive: true, force: true });
}
