import { makeRequest } from "./openai";
import { startDictation, stopDictation, restartDictation } from "./dictation";
import { startCamera, stopCamera } from "./camera";
import { scaleAndStackImagesAndGetBase64 } from "./imageStacker";

const IMAGE_STACK_SIZE = 3;
const SCAN_INTERVAL_MS = 30_000;
const FIRST_SCAN_DELAY_MS = 3_000;
const MAX_CAPTURES = 24;

const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABSAPI_KEY;
const ELEVENLABS_VOICEID = import.meta.env.VITE_ELEVENLABS_VOICEID;

const getAudio = () => document.getElementById('audio') as HTMLAudioElement
const getResponseDiv = () => document.getElementById('response') as HTMLElement

let isDictating = false;
let imageStack: HTMLImageElement = [];
let imageStackInterval = null;

let unsentMessages = [];
let openAiCallInTransit = false;
let newMessagesWatcherInterval = null;

function pushNewImageOnStack() {
  const canvas = document.querySelector("canvas")! as HTMLCanvasElement;
  const base64 = canvas.toDataURL("image/jpeg");
  const image = document.createElement("img");
  image.src = base64;

  imageStack.push(image);
  if (imageStack.length > IMAGE_STACK_SIZE) {
    imageStack.shift();
  }
}

let voices

window.speechSynthesis.onvoiceschanged = function() {
  voices = window.speechSynthesis.getVoices();
};

function dictationEventHandler(message?: string) {
  if (message) {
    unsentMessages.push(message);
  }

  if (!openAiCallInTransit) {
    //doRequest(message);
  } else {
    unsentMessages.push(message);
  }
}

function doRequest (message?: string) {
    if (openAiCallInTransit || imageStack.length === 0) return;

    setScanning(true);
    const divResp = getResponseDiv ()
    divResp.className = "idle"
    divResp.textContent = "Analyzing subject…"
    openAiCallInTransit = true;
    const base64 = scaleAndStackImagesAndGetBase64(imageStack);
    addCapture(base64);
    const textPrompt = unsentMessages.join(" ");
    unsentMessages = [];
    makeRequest(textPrompt, base64).then((result) => {
      // the dictation is catching its own speech!!!!! stop dictation before speaking.

      stopDictation();

	console.log(result);
      setScanning(false);
      typeOutResponse(result);
      addLogEntry(base64, result);

      const finish = () => {
        openAiCallInTransit = false;
        try {
          restartDictation();
        } catch (err) {
          // recognition may still be stopping; it's fine to skip a restart
          console.warn(err);
        }
        document.querySelector("#assessmentStatus")!.textContent = "Complete";
      };

      document.querySelector("#assessmentStatus")!.textContent = "Transmitting";
      textToSpeechStream(ELEVENLABS_API_KEY, result)
        .then(stream => playStreamInAudio(stream, finish))
        .catch(err => {
          console.error(err);
          finish();
        });
      /**
      let utterance = new SpeechSynthesisUtterance(result);
      utterance.volume = .8; // Volume range = 0 - 1
      utterance.rate = .9; // Speed of the text read , default 1
     // utterance.voice = voices[1]; // change voice
    //  utterance.lang = 'en-GB'; // Language, default 'en-US'
      speechSynthesis.speak(utterance);
      utterance.onend = () => {
        restartDictation();
        openAiCallInTransit = false;
      };*/
    });
}

// after AI call in transit is done, if we have
// some messages in the unsent queue, we should make another openai call.
function newMessagesWatcher() {
  if (!openAiCallInTransit && unsentMessages.length > 0) {
    dictationEventHandler();
  }
}

// ---------- dashboard UI ----------

let scanCount = 0;
let nextScanAt = 0;
let scanLoopInterval = null;
let typeOutTimer = null;

function setScanning(on: boolean) {
  document.body.classList.toggle("scanning", on);
  document.querySelector("#assessmentStatus")!.textContent = on ? "Processing" : "Complete";
  document.querySelector("#hudAssessment")!.textContent = on ? "in progress" : "complete";
  if (on) {
    document.querySelector("#hudScanMode")!.textContent = String(randomInt(10000, 99999));
    document.querySelector("#hudFit")!.textContent = (0.9 + Math.random() * 0.09).toFixed(2);
    document.querySelector("#hudSpeech")!.textContent = String(randomInt(60, 99));
    scanCount++;
    document.querySelector("#scanCount")!.textContent = String(scanCount);
    document.querySelector("#captureTime")!.textContent = timestamp();
  }
}

function timestamp() {
  return new Date().toLocaleTimeString([], { hour12: false });
}

function typeOutResponse(text: string) {
  const divResp = getResponseDiv();
  divResp.className = "";
  divResp.textContent = "";
  const textNode = document.createTextNode("");
  const caret = document.createElement("span");
  caret.className = "caret";
  divResp.append(textNode, caret);

  typeOutTimer && clearInterval(typeOutTimer);
  let i = 0;
  typeOutTimer = setInterval(() => {
    textNode.data = text.slice(0, ++i);
    divResp.scrollTop = divResp.scrollHeight;
    if (i >= text.length) clearInterval(typeOutTimer);
  }, 25);
}

function addCapture(imageUrl: string) {
  const grid = document.querySelector("#debugImages")!;
  const figure = document.createElement("figure");
  const img = document.createElement("img");
  img.src = imageUrl;
  const caption = document.createElement("figcaption");
  const id = document.createElement("span");
  id.textContent = `#${String(scanCount).padStart(4, "0")}`;
  const time = document.createElement("span");
  time.textContent = timestamp();
  caption.append(id, time);
  figure.append(img, caption);
  grid.prepend(figure);
  while (grid.children.length > MAX_CAPTURES) grid.lastChild!.remove();
  document.querySelector("#captureCount")!.textContent = String(grid.children.length);
}

function addLogEntry(imageUrl: string, text: string) {
  const log = document.querySelector("#log")!;
  const entry = document.createElement("div");
  entry.className = "entry";
  const img = document.createElement("img");
  img.src = imageUrl;
  const body = document.createElement("div");
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `${timestamp()} // SUBJECT #${String(scanCount).padStart(4, "0")}`;
  const t = document.createElement("div");
  t.className = "text";
  t.textContent = text;
  body.append(meta, t);
  entry.append(img, body);
  log.prepend(entry);
  while (log.children.length > 50) log.lastChild!.remove();
  document.querySelector("#logCount")!.textContent = String(log.children.length);
}

function randomInt(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

// Columns of churning numbers down the left of the HUD, as in the film.
function updateHudNumbers() {
  const rows = [];
  for (let i = 0; i < 8; i++) {
    if (i === 5) rows.push("");
    rows.push(`${randomInt(100000, 999999)} ${randomInt(100, 999)} ${String(randomInt(0, 99)).padStart(2, "0")}`);
  }
  document.querySelector("#hudNumbers")!.textContent = rows.join("\n");
}

function updateClock() {
  const now = timestamp();
  document.querySelector("#clock")!.textContent = now;
  document.querySelector("#overlayClock")!.textContent = new Date().toISOString().slice(0, 10) + " " + now;
}

// Fires a scan whenever the countdown elapses; a scan that comes due while a
// previous one is still speaking waits until it finishes.
function scanLoopTick() {
  const remaining = Math.max(0, nextScanAt - Date.now());
  const pct = 100 - (remaining / SCAN_INTERVAL_MS) * 100;
  (document.querySelector("#countdownBar") as HTMLElement).style.width = `${pct}%`;
  document.querySelector("#nextScan")!.textContent =
    openAiCallInTransit ? "BUSY" : `${Math.ceil(remaining / 1000)}s`;

  if (remaining === 0 && !openAiCallInTransit && imageStack.length > 0) {
    nextScanAt = Date.now() + SCAN_INTERVAL_MS;
    doRequest("");
  }
}

function startSurveillance() {
  isDictating = true;
  startCamera();
  startDictation(dictationEventHandler);

  imageStackInterval = setInterval(() => {
    pushNewImageOnStack();
  }, 800);

  newMessagesWatcherInterval = setInterval(() => {
    newMessagesWatcher();
  }, 100);

  // first scan shortly after start, once the camera has produced frames
  nextScanAt = Date.now() + FIRST_SCAN_DELAY_MS;
  scanLoopInterval = setInterval(scanLoopTick, 250);

  const btn = document.querySelector("#letsGo")!;
  btn.textContent = "Stop";
  btn.classList.add("danger");
  const rec = document.querySelector("#recIndicator")!;
  rec.textContent = "Monitoring";
  rec.classList.remove("off");
  document.querySelector("#feedStatus")!.textContent = "Online";
}

function stopSurveillance() {
  isDictating = false;
  stopCamera();
  stopDictation();

  imageStackInterval && clearInterval(imageStackInterval);
  newMessagesWatcherInterval && clearInterval(newMessagesWatcherInterval);
  scanLoopInterval && clearInterval(scanLoopInterval);

  const btn = document.querySelector("#letsGo")!;
  btn.textContent = "Start";
  btn.classList.remove("danger");
  const rec = document.querySelector("#recIndicator")!;
  rec.textContent = "Offline";
  rec.classList.add("off");
  document.querySelector("#feedStatus")!.textContent = "Offline";
  document.querySelector("#nextScan")!.textContent = "--";
  (document.querySelector("#countdownBar") as HTMLElement).style.width = "0";
}

document.addEventListener("DOMContentLoaded", async function () {
  updateClock();
  setInterval(updateClock, 1000);
  updateHudNumbers();
  setInterval(updateHudNumbers, 180);

  document.querySelector("#scan")!.addEventListener("click", function () {
    if (!isDictating || openAiCallInTransit) return;
    nextScanAt = Date.now() + SCAN_INTERVAL_MS;
    doRequest("");
  });

  document.querySelector("#letsGo")!.addEventListener("click", function () {
    isDictating ? stopSurveillance() : startSurveillance();
  });

  // Browsers block unmuted audio until the user interacts with the page;
  // any click unlocks it.
  document.addEventListener("click", () => {
    getAudio().play().catch(() => {});
    document.querySelector("#audioHint")!.hidden = true;
  }, { once: true });

  startSurveillance();
});

function textToSpeechStream(elevenLabsApiKey: string, text: string) {
  const voiceId = ELEVENLABS_VOICEID;

  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
    headers: {
      Accept: 'audio/mpeg',
      'Content-Type': 'application/json',
      'XI-API-Key': elevenLabsApiKey,
    },
    method: 'POST',
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      //model_id: 'eleven_multilingual_v1',
      voice_settings: {
        stability: 0.6,
        similarity_boost: 0.9,
        style: 0.7,
        use_speaker_boost: true,
      },
    }),
  }).then(res => {
    if (res.status === 401) {
      throw new Error('Invalid ElevenLabs API key')
    } else {
      return res.body!
    }
  })
}

function playStreamInAudio(stream: ReadableStream<Uint8Array>, onEnd: () => void) {
  const reader = stream.getReader()
  const mediaSource = new MediaSource()
  const audio = getAudio()
  audio.src = window.URL.createObjectURL(mediaSource)

  mediaSource.addEventListener(
    'sourceopen',
    function () {
      var sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg')
      var chunks = []

      function pump(stream: ReadableStreamDefaultReader<Uint8Array>) {
        return stream.read().then(data => {
          if (data.value) {
            chunks.push(data.value)

            sourceBuffer.appendBuffer(data.value)
          }
        })
      }

      sourceBuffer.addEventListener('updateend', () => pump(reader), false)

      pump(reader)

      audio.play()
        .then(() => console.log('audio playing'))
        .catch(err => {
          // autoplay blocked before the first user interaction
          console.warn(err);
          document.getElementById('audioHint')!.hidden = false;
        })
      reader.closed.then(() => {
        const intervalId = setInterval(() => {
          const isPlaying = isAudioPlaying(audio)
          //console.log({ isPlaying })
          if (!isPlaying) {
            clearInterval(intervalId)
            onEnd()
          }
        }, 200)
      })
    },
    false,
  )
}

function isAudioPlaying(audio: HTMLAudioElement) {
  return audio && audio.currentTime > 0 && !audio.paused && !audio.ended && audio.readyState > 2
}
