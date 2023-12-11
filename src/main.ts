import { makeRequest } from "./openai";
import { startDictation, stopDictation, restartDictation } from "./dictation";
import { startCamera, stopCamera } from "./camera";
import { scaleAndStackImagesAndGetBase64 } from "./imageStacker";

const IMAGE_STACK_SIZE = 3;

const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABSAPI_KEY;
const getAudio = () => document.getElementById('audio') as HTMLAudioElement

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
    openAiCallInTransit = true;
    const base64 = scaleAndStackImagesAndGetBase64(imageStack);
    const textPrompt = unsentMessages.join(" ");
    unsentMessages = [];
    makeRequest(textPrompt, base64).then((result) => {
      // the dictation is catching its own speech!!!!! stop dictation before speaking.

      stopDictation();

	console.log(result);
      const rSpeech = textToSpeechStream(ELEVENLABS_API_KEY,result);
     console.log(rSpeech)
     rSpeech.then(stream =>

      playStreamInAudio (stream, () => { 
        restartDictation();
        openAiCallInTransit = false;
	})

 );
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
  } else {
    unsentMessages.push(message);
  }
}

// after AI call in transit is done, if we have
// some messages in the unsent queue, we should make another openai call.
function newMessagesWatcher() {
  if (!openAiCallInTransit && unsentMessages.length > 0) {
    dictationEventHandler();
  }
}

document.addEventListener("DOMContentLoaded", async function () {
  document.querySelector("#letsGo")!.addEventListener("click", function () {
    isDictating = !isDictating;

    if (isDictating) {
      startCamera();
      startDictation(dictationEventHandler);

      imageStackInterval = setInterval(() => {
        pushNewImageOnStack();
      }, 800);

      newMessagesWatcherInterval = setInterval(() => {
        newMessagesWatcher();
      }, 100);

      document.querySelector("#letsGo")!.textContent = "Stop";
    } else {
      stopCamera();
      stopDictation();

      imageStackInterval && clearInterval(imageStackInterval);
      newMessagesWatcherInterval && clearInterval(newMessagesWatcherInterval);

      document.querySelector("#letsGo")!.textContent = "Start";
    }
  });
});

function textToSpeechStream(elevenLabsApiKey: string, text: string) {
  //const voiceId = 'SOYHLrjzK2X1ezoPC6cr' // Harry
  const voiceId = '21m00Tcm4TlvDq8ikWAM' //Rachel

  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
    headers: {
      Accept: 'audio/mpeg',
      'Content-Type': 'application/json',
      'XI-API-Key': elevenLabsApiKey,
    },
    method: 'POST',
    body: JSON.stringify({
      text,
      //model_id: 'eleven_multilingual_v2',
      model_id: 'eleven_multilingual_v1',
      voice_settings: {
        stability: 0.29,
        similarity_boost: 0.75,
        style: 0.5,
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
      reader.closed.then(() => {
        const intervalId = setInterval(() => {
          const isPlaying = isAudioPlaying(audio)
          console.log({ isPlaying })
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
