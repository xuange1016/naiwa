import { CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow, LogicalPosition, LogicalSize } from "@tauri-apps/api/window";
import "./styles.css";

type PetManifest = {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  idleFrame: string;
  framePattern: string;
  audio: string | null;
};

type PetAction = {
  id: string;
  name: string;
  root: string;
  manifest: PetManifest;
};

const APP_NAME = "奶蛙";
const ACTION_SOURCES = [
  { id: "original", name: "原始动作", root: "/pets/naiwa" },
  { id: "idle-sway", name: "待机摆动", root: "/actions/idle-sway" },
  { id: "front-sway", name: "前方摇摆", root: "/actions/front-sway" },
  { id: "big-laugh", name: "开怀大笑", root: "/actions/big-laugh" },
  { id: "library-dance", name: "图书馆舞步", root: "/actions/library-dance" },
  { id: "back-dance", name: "背身扭扭舞", root: "/actions/back-dance" },
] as const;
const PET_SIZE_OPTIONS = [
  { id: "max", label: "超大号", width: 360, height: 480 },
  { id: "large", label: "大号", width: 240, height: 320 },
  { id: "medium", label: "中号", width: 180, height: 240 },
  { id: "small", label: "小号", width: 120, height: 160 },
  { id: "tiny", label: "极小", width: 90, height: 120 },
  { id: "mini", label: "迷你", width: 60, height: 80 },
] as const;

type PetSizeId = (typeof PET_SIZE_OPTIONS)[number]["id"];

const appWindow = getCurrentWindow();
const menuItemId = (name: string) => `${appWindow.label}-${name}`;
const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root element");
}

const pet = document.createElement("img");
pet.className = "pet";
pet.alt = "Naiwa desktop pet";
pet.draggable = false;

const hint = document.createElement("div");
hint.className = "loading";
hint.textContent = "Loading...";

app.append(hint, pet);

const isPetSizeId = (value: string | null): value is PetSizeId =>
  PET_SIZE_OPTIONS.some((size) => size.id === value);

const getPetSize = (sizeId: PetSizeId) => PET_SIZE_OPTIONS.find((size) => size.id === sizeId) ?? PET_SIZE_OPTIONS[0];

const getInitialPetSizeId = (): PetSizeId => {
  const size = new URLSearchParams(window.location.search).get("size");
  return isPetSizeId(size) ? size : "medium";
};

const getInitialMirrored = () => new URLSearchParams(window.location.search).get("mirrored") === "true";

let currentPetSizeId: PetSizeId = getInitialPetSizeId();
let currentMirrored = getInitialMirrored();
let contextMenuPromise: Promise<Menu> | null = null;
let lastContextMenuPosition = { x: 64, y: 64 };
const petSizeItems = new Map<PetSizeId, CheckMenuItem>();
let mirrorItem: CheckMenuItem | null = null;
let actionPool: PetAction[] = [];
let playAction: ((action: PetAction) => Promise<void>) | null = null;

const playRandomAction = async () => {
  if (!playAction || actionPool.length === 0) {
    return;
  }

  const action = actionPool[Math.floor(Math.random() * actionPool.length)];
  await playAction(action);
};

const syncPetSizeChecks = async () => {
  await Promise.all(
    PET_SIZE_OPTIONS.map((size) => petSizeItems.get(size.id)?.setChecked(size.id === currentPetSizeId)),
  );
};

const setPetSize = async (sizeId: PetSizeId) => {
  const size = getPetSize(sizeId);

  currentPetSizeId = sizeId;
  await appWindow.setSize(new LogicalSize(size.width, size.height));
  await syncPetSizeChecks();
};

const setMirrored = async (mirrored: boolean) => {
  currentMirrored = mirrored;
  pet.classList.toggle("is-mirrored", currentMirrored);
  await mirrorItem?.setChecked(currentMirrored);
};

const createAnotherPet = () => {
  const size = getPetSize(currentPetSizeId);
  const label = `pet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const window = new WebviewWindow(label, {
    url: `/?size=${currentPetSizeId}&mirrored=${currentMirrored}`,
    title: APP_NAME,
    width: size.width,
    height: size.height,
    x: lastContextMenuPosition.x + 24,
    y: lastContextMenuPosition.y + 24,
    resizable: false,
    decorations: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    skipTaskbar: true,
    shadow: false,
  });

  window.once("tauri://error", (event) => {
    console.error("Failed to create pet window", event.payload);
  });
};

const createContextMenu = async () => {
  const addPetItem = await MenuItem.new({
    id: menuItemId("add-pet"),
    text: "再来一只",
    action: createAnotherPet,
  });

  mirrorItem = await CheckMenuItem.new({
    id: menuItemId("mirror-pet"),
    text: "镜像翻转",
    checked: currentMirrored,
    action: () => {
      void setMirrored(!currentMirrored);
    },
  });

  const closePetItem = await MenuItem.new({
    id: menuItemId("close-pet"),
    text: "关闭这只奶蛙",
    action: () => {
      void appWindow.close();
    },
  });

  const randomActionItem = await MenuItem.new({
    id: menuItemId("random-action"),
    text: "随机播放",
    action: () => {
      void playRandomAction();
    },
  });

  const actionItems = await Promise.all(
    actionPool.map(async (action) =>
      MenuItem.new({
        id: menuItemId(`action-${action.id}`),
        text: action.name,
        action: () => {
          void playAction?.(action);
        },
      }),
    ),
  );

  const actionMenu = await Submenu.new({
    id: menuItemId("action-menu"),
    text: "动作库",
    items: [randomActionItem, await PredefinedMenuItem.new({ item: "Separator" }), ...actionItems],
  });

  const sizeItems = await Promise.all(
    PET_SIZE_OPTIONS.map(async (size) => {
      const item = await CheckMenuItem.new({
        id: menuItemId(`pet-size-${size.id}`),
        text: size.label,
        checked: size.id === currentPetSizeId,
        action: () => {
          void setPetSize(size.id);
        },
      });

      petSizeItems.set(size.id, item);
      return item;
    }),
  );

  // 1. 尺寸设定只包含尺寸相关的选项
  const sizeMenu = await Submenu.new({
    id: menuItemId("pet-size-menu"),
    text: "尺寸设定",
    items: sizeItems, 
  });

  // 2. 在根菜单中组合“再来一只”、“分隔符”和“尺寸设定”子菜单
  return Menu.new({ 
    items: [
      addPetItem,
      actionMenu,
      mirrorItem,
      sizeMenu,
      await PredefinedMenuItem.new({ item: "Separator" }),
      closePetItem,
    ]
  });
};

const getContextMenu = () => {
  contextMenuPromise ??= createContextMenu();
  return contextMenuPromise;
};

const enableContextMenu = () => {
  app.addEventListener("contextmenu", async (event) => {
    event.preventDefault();
    lastContextMenuPosition = { x: event.screenX, y: event.screenY };

    const menu = await getContextMenu();
    await syncPetSizeChecks();
    await mirrorItem?.setChecked(currentMirrored);
    await menu.popup(new LogicalPosition(event.clientX, event.clientY), appWindow);
  });
};

const loadManifest = async (manifestUrl: string): Promise<PetManifest> => {
  const response = await fetch(manifestUrl);
  if (!response.ok) {
    throw new Error(`Failed to load action manifest: ${response.status}`);
  }

  return response.json() as Promise<PetManifest>;
};

const assetPath = (action: PetAction, path: string) => `${action.root}/${path}`;

const formatFramePath = (action: PetAction, index: number) => {
  const frameIndex = String(index).padStart(4, "0");
  return assetPath(action, action.manifest.framePattern.replace("{index}", frameIndex));
};

const loadActionPool = async () =>
  Promise.all(
    ACTION_SOURCES.map(async (source) => ({
      ...source,
      manifest: await loadManifest(`${source.root}/manifest.json`),
    })),
  );

const preloadImages = async (action: PetAction) => {
  const promises = Array.from({ length: action.manifest.frameCount }, (_, index) => {
    const image = new Image();
    image.decoding = "async";
    image.src = formatFramePath(action, index);
    return image.decode().catch(() => undefined);
  });

  await Promise.all(promises);
};

const loadImage = (src: string) =>
  new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });

const createPetPlayer = async (idleAction: PetAction) => {
  let animationFrame = 0;
  let startTime = 0;
  let activeAction: PetAction | null = null;
  let activeAudio: HTMLAudioElement | null = null;
  const audioByAction = new Map<string, HTMLAudioElement>();

  const getAudio = (action: PetAction) => {
    if (!action.manifest.audio) {
      return null;
    }

    let audio = audioByAction.get(action.id);
    if (!audio) {
      audio = new Audio(assetPath(action, action.manifest.audio));
      audio.preload = "auto";
      audioByAction.set(action.id, audio);
    }
    return audio;
  };

  const setIdle = () => {
    window.cancelAnimationFrame(animationFrame);
    activeAction = null;
    activeAudio?.pause();
    if (activeAudio) {
      activeAudio.currentTime = 0;
    }
    activeAudio = null;
    pet.src = assetPath(idleAction, idleAction.manifest.idleFrame);
  };

  const render = (now: number) => {
    if (!activeAction) {
      return;
    }

    const elapsed = now - startTime;
    const frame = Math.floor((elapsed / 1000) * activeAction.manifest.fps);

    if (frame >= activeAction.manifest.frameCount) {
      setIdle();
      return;
    }

    pet.src = formatFramePath(activeAction, frame);
    animationFrame = window.requestAnimationFrame(render);
  };

  const play = async (action: PetAction) => {
    window.cancelAnimationFrame(animationFrame);
    activeAudio?.pause();
    activeAction = action;
    activeAudio = getAudio(action);
    if (activeAudio) {
      activeAudio.currentTime = 0;
    }
    startTime = performance.now();
    pet.src = formatFramePath(action, 0);
    animationFrame = window.requestAnimationFrame(render);

    try {
      await activeAudio?.play();
    } catch {
      // Browser policies should allow click-triggered playback, but animation still works if audio is blocked.
    }
  };

  setIdle();

  return play;
};

const enableWindowDrag = () => {
  pet.addEventListener("pointerdown", async (event) => {
    if (event.button !== 0) {
      return;
    }

    // Tauri 开始原生拖拽后通常不会再派发 click 事件；在按下时播放，
    // 既能保证轻点有反馈，也不影响继续拖动窗口。
    void playRandomAction();
    await appWindow.startDragging();
  });
};

const boot = async () => {
  try {
    actionPool = await loadActionPool();
    const idleAction = actionPool[0];
    document.documentElement.style.setProperty("--pet-aspect", `${idleAction.manifest.width} / ${idleAction.manifest.height}`);
    pet.style.aspectRatio = `${idleAction.manifest.width} / ${idleAction.manifest.height}`;
    const idleSrc = assetPath(idleAction, idleAction.manifest.idleFrame);
    await loadImage(idleSrc);
    pet.src = idleSrc;
    await setMirrored(currentMirrored);
    playAction = await createPetPlayer(idleAction);

    hint.remove();
    pet.classList.add("is-ready");
    enableWindowDrag();
    enableContextMenu();
    actionPool.forEach((action) => void preloadImages(action));
  } catch (error) {
    hint.textContent = error instanceof Error ? error.message : "Failed to load pet";
  }
};

void boot();
