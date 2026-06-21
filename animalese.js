#!/usr/bin/env node

(function createAnimaleseModule(root, factory) {
  const animalese = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = animalese;
  }

  if (root) {
    root.Animalese = animalese;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function animaleseFactory() {
  const LETTER_GRAPHS = [
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
    "g",
    "h",
    "i",
    "j",
    "k",
    "l",
    "m",
    "n",
    "o",
    "p",
    "q",
    "r",
    "s",
    "t",
    "u",
    "v",
    "w",
    "x",
    "y",
    "z",
  ];

  const DIGRAPHS = ["ch", "sh", "ph", "th", "wh"];
  const BEBEBESE = "bebebese_slow";
  const DEFAULT_SENTENCE = "Gib me ur FEETS!";
  const DEFAULT_SPEED = 2;
  const OUTPUT_FILE = "output.wav";
  const TARGET_SAMPLE_RATE = 44100;
  const PUNCTUATION = new Set(
    `!"#$%&'()*+,-./:;<=>?@[\\]^_\`{|}~`.split(""),
  );

  function isNodeEnvironment() {
    return typeof process !== "undefined" && !!(process.versions && process.versions.node);
  }

  function getNodeDependencies() {
    if (!isNodeEnvironment()) {
      throw new Error("Node.js APIs are not available in this environment.");
    }

    return {
      fs: require("fs"),
      path: require("path"),
      childProcess: require("child_process"),
    };
  }

  function replaceSwearWords(sentence) {
    const swearWords = ["fuck", "shit", "piss", "crap", "bugger"];
    let updatedSentence = sentence;

    for (const word of swearWords) {
      updatedSentence = updatedSentence
        .split(word)
        .join("*".repeat(word.length));
    }

    return updatedSentence;
  }

  function replaceParentheses(sentence) {
    let updatedSentence = sentence;

    while (updatedSentence.includes("(") || updatedSentence.includes(")")) {
      const start = updatedSentence.indexOf("(");
      const end = updatedSentence.indexOf(")");

      if (start === -1 || end === -1 || end < start) {
        throw new Error("Unmatched parentheses in sentence.");
      }

      updatedSentence =
        updatedSentence.slice(0, start) +
        "*".repeat(end - start) +
        updatedSentence.slice(end + 1);
    }

    return updatedSentence;
  }

  function tokenizeSentence(sentence) {
    const sanitizedSentence = replaceParentheses(replaceSwearWords(sentence.toLowerCase()));
    const tokens = [];

    for (let index = 0; index < sanitizedSentence.length; index += 1) {
      let current = null;

      if (
        index < sanitizedSentence.length - 1 &&
        DIGRAPHS.includes(sanitizedSentence[index] + sanitizedSentence[index + 1])
      ) {
        current = sanitizedSentence[index] + sanitizedSentence[index + 1];
        index += 1;
      } else if (LETTER_GRAPHS.includes(sanitizedSentence[index])) {
        current = sanitizedSentence[index];
      } else if (PUNCTUATION.has(sanitizedSentence[index])) {
        current = BEBEBESE;
      }

      if (current !== null) {
        tokens.push(current);
      }
    }

    return tokens;
  }

  function toUint8Array(input) {
    if (input instanceof Uint8Array) {
      return input;
    }

    if (typeof Buffer !== "undefined" && Buffer.isBuffer(input)) {
      return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    }

    if (input instanceof ArrayBuffer) {
      return new Uint8Array(input);
    }

    if (ArrayBuffer.isView(input)) {
      return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    }

    throw new Error("Unsupported binary input.");
  }

  function readFourCC(bytes, offset) {
    return String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3],
    );
  }

  function parseWav(binary) {
    const bytes = toUint8Array(binary);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    if (readFourCC(bytes, 0) !== "RIFF" || readFourCC(bytes, 8) !== "WAVE") {
      throw new Error("Unsupported WAV file.");
    }

    let offset = 12;
    let format = null;
    let samples = null;

    while (offset + 8 <= bytes.length) {
      const chunkId = readFourCC(bytes, offset);
      const chunkSize = view.getUint32(offset + 4, true);
      const chunkStart = offset + 8;
      const chunkEnd = chunkStart + chunkSize;

      if (chunkEnd > bytes.length) {
        throw new Error("Corrupt WAV file.");
      }

      if (chunkId === "fmt ") {
        format = {
          audioFormat: view.getUint16(chunkStart, true),
          channels: view.getUint16(chunkStart + 2, true),
          sampleRate: view.getUint32(chunkStart + 4, true),
          bitsPerSample: view.getUint16(chunkStart + 14, true),
        };
      } else if (chunkId === "data") {
        samples = new Float32Array(chunkSize / 2);

        for (let index = 0; index < samples.length; index += 1) {
          samples[index] = view.getInt16(chunkStart + index * 2, true) / 32768;
        }
      }

      offset = chunkEnd + (chunkSize % 2);
    }

    if (!format || !samples) {
      throw new Error("Missing WAV format or data chunk.");
    }

    if (format.audioFormat !== 1 || format.channels !== 1 || format.bitsPerSample !== 16) {
      throw new Error("Only 16-bit mono PCM WAV files are supported.");
    }

    return { sampleRate: format.sampleRate, samples };
  }

  function resampleLinear(samples, inputRate, outputRate) {
    if (inputRate === outputRate) {
      return samples;
    }

    const outputLength = Math.max(1, Math.round(samples.length * outputRate / inputRate));
    const resampled = new Float32Array(outputLength);

    for (let index = 0; index < outputLength; index += 1) {
      const sourcePosition = index * inputRate / outputRate;
      const leftIndex = Math.floor(sourcePosition);
      const rightIndex = Math.min(leftIndex + 1, samples.length - 1);
      const mix = sourcePosition - leftIndex;
      const left = samples[Math.min(leftIndex, samples.length - 1)];
      const right = samples[rightIndex];
      resampled[index] = left + (right - left) * mix;
    }

    return resampled;
  }

  function concatenateSampleSets(sampleSets) {
    const totalLength = sampleSets.reduce((sum, current) => sum + current.length, 0);
    const combined = new Float32Array(totalLength);
    let offset = 0;

    for (const samples of sampleSets) {
      combined.set(samples, offset);
      offset += samples.length;
    }

    return combined;
  }

  function changePlaybackSpeed(samples, speedChange) {
    if (!Number.isFinite(speedChange) || speedChange <= 0) {
      throw new Error("Playback speed must be a positive number.");
    }

    const outputLength = Math.max(1, Math.round(samples.length / speedChange));
    const shifted = new Float32Array(outputLength);

    for (let index = 0; index < outputLength; index += 1) {
      const sourcePosition = index * speedChange;
      const leftIndex = Math.floor(sourcePosition);
      const rightIndex = Math.min(leftIndex + 1, samples.length - 1);
      const mix = sourcePosition - leftIndex;
      const left = samples[Math.min(leftIndex, samples.length - 1)] ?? 0;
      const right = samples[rightIndex] ?? left;
      shifted[index] = left + (right - left) * mix;
    }

    return shifted;
  }

  function encodeWav(samples, sampleRate) {
    const dataSize = samples.length * 2;
    const bytes = new Uint8Array(44 + dataSize);
    const view = new DataView(bytes.buffer);

    bytes.set([82, 73, 70, 70], 0);
    view.setUint32(4, 36 + dataSize, true);
    bytes.set([87, 65, 86, 69], 8);
    bytes.set([102, 109, 116, 32], 12);
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    bytes.set([100, 97, 116, 97], 36);
    view.setUint32(40, dataSize, true);

    for (let index = 0; index < samples.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, samples[index]));
      const value = sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767);
      view.setInt16(44 + index * 2, value, true);
    }

    return bytes;
  }

  function randomVoiceSpeed() {
    return 1.75 + Math.random() * (2.5 - 1.75);
  }

  function decodeBase64(base64) {
    if (typeof Buffer !== "undefined") {
      return Uint8Array.from(Buffer.from(base64, "base64"));
    }

    const decoded = atob(base64);
    const bytes = new Uint8Array(decoded.length);

    for (let index = 0; index < decoded.length; index += 1) {
      bytes[index] = decoded.charCodeAt(index);
    }

    return bytes;
  }

  function buildSentenceFromLoader(sentence, loadTokenSamples) {
    const tokens = tokenizeSentence(sentence);
    return Promise.all(
      tokens.map(async function loadToken(token) {
        const tokenAudio = await loadTokenSamples(token);
        return resampleLinear(tokenAudio.samples, tokenAudio.sampleRate, TARGET_SAMPLE_RATE);
      }),
    ).then(function buildAudio(sampleSets) {
      return {
        sampleRate: TARGET_SAMPLE_RATE,
        samples: concatenateSampleSets(sampleSets),
      };
    });
  }

  function buildAndSaySentenceFromLoader(sentence, loadTokenSamples) {
    return buildSentenceFromLoader(sentence, loadTokenSamples).then(function applyVoice(audio) {
      return {
        sampleRate: audio.sampleRate,
        samples: changePlaybackSpeed(audio.samples, randomVoiceSpeed()),
      };
    });
  }

  function buildAndSaySentenceWithVoiceFromLoader(sentence, voice, loadTokenSamples) {
    return buildSentenceFromLoader(sentence, loadTokenSamples).then(function applyVoice(audio) {
      return {
        sampleRate: audio.sampleRate,
        samples: changePlaybackSpeed(audio.samples, voice),
      };
    });
  }

  function createBrowserPlayer(options = {}) {
    if (
      typeof window === "undefined" ||
      (typeof window.AudioContext === "undefined" &&
        typeof window.webkitAudioContext === "undefined")
    ) {
      throw new Error("Browser audio playback is not available in this environment.");
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioContext = options.audioContext || new AudioContextClass();
    const embeddedLetters =
      options.lettersData ||
      (typeof globalThis !== "undefined" ? globalThis.AnimaleseLetterData : undefined);

    if (!embeddedLetters) {
      throw new Error("Missing embedded letter data. Load letters-data.js before animalese.js.");
    }

    const cache = new Map();
    let activeSource = null;

    async function loadTokenSamples(token) {
      if (!cache.has(token)) {
        const encoded = embeddedLetters[token];

        if (!encoded) {
          throw new Error(`Missing audio file for token "${token}".`);
        }

        cache.set(
          token,
          Promise.resolve().then(function parseEmbeddedAudio() {
            return parseWav(decodeBase64(encoded));
          }),
        );
      }

      return cache.get(token);
    }

    async function playAudio(audio) {
      await audioContext.resume();

      if (activeSource) {
        activeSource.stop();
        activeSource.disconnect();
      }

      const audioBuffer = audioContext.createBuffer(1, audio.samples.length, audio.sampleRate);
      audioBuffer.copyToChannel(audio.samples, 0);

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start();
      activeSource = source;

      source.addEventListener("ended", function handleEnded() {
        if (activeSource === source) {
          activeSource.disconnect();
          activeSource = null;
        }
      });

      return source;
    }

    return {
      audioContext,
      buildSentence(sentence) {
        return buildSentenceFromLoader(sentence, loadTokenSamples);
      },
      buildAndSaySentence(sentence) {
        return buildAndSaySentenceFromLoader(sentence, loadTokenSamples);
      },
      buildAndSaySentenceWithVoice(sentence, voice) {
        return buildAndSaySentenceWithVoiceFromLoader(sentence, voice, loadTokenSamples);
      },
      async playSentence(sentence, voice = DEFAULT_SPEED) {
        const audio = await buildAndSaySentenceWithVoiceFromLoader(
          sentence,
          voice,
          loadTokenSamples,
        );
        return playAudio(audio);
      },
      async preload() {
        const tokens = LETTER_GRAPHS.concat(DIGRAPHS, [BEBEBESE]);
        await Promise.all(tokens.map(loadTokenSamples));
      },
      stop() {
        if (activeSource) {
          activeSource.stop();
          activeSource.disconnect();
          activeSource = null;
        }
      },
    };
  }

  function loadNodeTokenSamples(token) {
    const { fs, path } = getNodeDependencies();
    const lettersDir = path.join(__dirname, "letters");
    const filePath = path.join(lettersDir, `${token}.wav`);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing audio file for token "${token}".`);
    }

    return parseWav(fs.readFileSync(filePath));
  }

  function buildSentence(sentence) {
    if (!isNodeEnvironment()) {
      throw new Error("buildSentence is only available synchronously in Node.js.");
    }

    const tokens = tokenizeSentence(sentence);
    const sampleSets = tokens.map(function loadToken(token) {
      const tokenAudio = loadNodeTokenSamples(token);
      return resampleLinear(tokenAudio.samples, tokenAudio.sampleRate, TARGET_SAMPLE_RATE);
    });

    return {
      sampleRate: TARGET_SAMPLE_RATE,
      samples: concatenateSampleSets(sampleSets),
    };
  }

  function buildAndSaySentence(sentence) {
    if (!isNodeEnvironment()) {
      throw new Error("buildAndSaySentence is only available synchronously in Node.js.");
    }

    const audio = buildSentence(sentence);
    return {
      sampleRate: audio.sampleRate,
      samples: changePlaybackSpeed(audio.samples, randomVoiceSpeed()),
    };
  }

  function buildAndSaySentenceWithVoice(sentence, voice) {
    if (!isNodeEnvironment()) {
      throw new Error("buildAndSaySentenceWithVoice is only available synchronously in Node.js.");
    }

    const audio = buildSentence(sentence);
    return {
      sampleRate: audio.sampleRate,
      samples: changePlaybackSpeed(audio.samples, voice),
    };
  }

  function writeOutputFile(audio, outputPath = OUTPUT_FILE) {
    if (!isNodeEnvironment()) {
      throw new Error("writeOutputFile is only available in Node.js.");
    }

    const { fs } = getNodeDependencies();
    fs.writeFileSync(outputPath, Buffer.from(encodeWav(audio.samples, audio.sampleRate)));
    return outputPath;
  }

  function tryPlayFile(outputPath) {
    if (!isNodeEnvironment()) {
      throw new Error("File playback is only available in Node.js.");
    }

    const { childProcess } = getNodeDependencies();
    const platformPlayers = {
      darwin: [["afplay", [outputPath]]],
      linux: [
        ["ffplay", ["-nodisp", "-autoexit", outputPath]],
        ["aplay", [outputPath]],
        ["paplay", [outputPath]],
      ],
      win32: [
        [
          "powershell",
          [
            "-NoProfile",
            "-Command",
            `(New-Object Media.SoundPlayer '${outputPath.replace(/'/g, "''")}').PlaySync()`,
          ],
        ],
      ],
    };

    for (const [command, args] of platformPlayers[process.platform] || []) {
      const result = childProcess.spawnSync(command, args, { stdio: "ignore" });
      if (!result.error && result.status === 0) {
        return true;
      }
    }

    return false;
  }

  function parseCliArguments(argv) {
    const { path } = getNodeDependencies();
    const options = {
      play: true,
      output: path.join(__dirname, OUTPUT_FILE),
      sentenceParts: [],
      speed: DEFAULT_SPEED,
    };

    for (let index = 0; index < argv.length; index += 1) {
      const argument = argv[index];

      if (argument === "--speed") {
        options.speed = Number(argv[index + 1]);
        index += 1;
      } else if (argument === "--output") {
        options.output = path.resolve(__dirname, argv[index + 1]);
        index += 1;
      } else if (argument === "--no-play") {
        options.play = false;
      } else {
        options.sentenceParts.push(argument);
      }
    }

    return {
      ...options,
      sentence:
        options.sentenceParts.length > 0 ? options.sentenceParts.join(" ") : DEFAULT_SENTENCE,
    };
  }

  function main() {
    const options = parseCliArguments(process.argv.slice(2));
    const audio = buildAndSaySentenceWithVoice(options.sentence, options.speed);
    const outputPath = writeOutputFile(audio, options.output);

    if (options.play && !tryPlayFile(outputPath)) {
      console.warn(`Wrote ${outputPath}, but no supported audio player was available to play it.`);
      return;
    }

    console.log(`Wrote ${outputPath}`);
  }

  const api = {
    DEFAULT_SPEED,
    DEFAULT_SENTENCE,
    buildAndSaySentence,
    buildAndSaySentenceFromLoader,
    buildAndSaySentenceWithVoice,
    buildAndSaySentenceWithVoiceFromLoader,
    buildSentence,
    buildSentenceFromLoader,
    changePlaybackSpeed,
    createBrowserPlayer,
    encodeWav,
    parseWav,
    randomVoiceSpeed,
    replaceParentheses,
    replaceSwearWords,
    tokenizeSentence,
    writeOutputFile,
  };

  if (
    typeof module !== "undefined" &&
    module.exports &&
    typeof require !== "undefined" &&
    require.main === module
  ) {
    try {
      main();
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }

  return api;
});
