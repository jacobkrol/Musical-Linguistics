import "./App.css";
import MidiWriter, { Pitch } from "midi-writer-js";
import MidiPlayer, { Event } from "midi-player-js";
import { Soundfont } from "smplr";
import { Factory } from "vexflow";
import { useEffect, useRef, useState } from "react";
import Play from "./assets/play.svg";
import Pause from "./assets/pause.svg";
import Stop from "./assets/stop.svg";
import Circle from "./assets/circle.svg";

const groupArrayByN: (arr: string[], n: number, pad: string) => string[][] = (
  arr,
  n,
  pad
) => {
  let result = [];
  for (let i = 0; i < arr.length; i += n) {
    let group = arr.slice(i, i + n);
    while (group.length < n) {
      group.push(pad);
    }
    result.push(group);
  }
  return result;
};

function App() {
  const [dataUri, setDataUri] = useState("");
  const [playerStatus, setPlayerStatus] = useState("stopped");
  const selectedInstrument = useRef("acoustic_grand_piano");
  const selectedInterval = useRef("cmajor");

  const getBpm = () => {
    return (
      Number(
        (document.getElementById("tempo-select") as HTMLInputElement).value
      ) ?? 200
    );
  };

  const handleNote = (evt: Event) => {
    if (evt.name !== "Note on" || !instrument.current) {
      return;
    }

    // highlight current note
    const trebleNote = document.querySelector(".vf-stavenote:not(.filled)");
    trebleNote!.classList.add("filled");
    const classes = trebleNote!.classList;
    const beatClass =
      [...classes].find((c) => c.startsWith("beat-")) ?? "beat-0";
    const beat = beatClass.replace("beat-", "");
    const bassNote = document.querySelector(
      `.vf-stavenote:not(.filled).beat-${beat}`
    );
    bassNote?.classList.add("filled");

    if (!evt.velocity) return;

    instrument.current?.start({
      note: evt.noteName ?? "C1",
      duration: 60 / getBpm(),
    });

    // highlight current letter
    document
      .querySelector("#text span:not(.filled):not(.space)")
      ?.classList.add("filled");

    // move player dot
    if (document.getElementById("dot") && document.getElementById("bar")) {
      const { width } = document.getElementById("bar")!.getBoundingClientRect();
      const newLeft =
        Math.floor(
          (width * (100 - player.current.getSongPercentRemaining())) / 100
        ).toString() + "px";
      document.getElementById("dot")!.style.left = newLeft;
    }
  };

  const player = useRef(new MidiPlayer.Player(handleNote));
  const instrument = useRef<Soundfont>();
  const [instrumentLoaded, setInstrumentLoaded] = useState(false);
  const [fileLoaded, setFileLoaded] = useState(false);

  useEffect(() => {
    player.current.on("endOfFile", stopAudio);
    player.current.on("fileLoaded", () => {
      const timeEl = document.getElementById("time-total");
      if (timeEl) {
        const seconds = player.current.getSongTime();
        const min = Math.floor(seconds / 60);
        const sec =
          seconds % 60 < 10
            ? "0" + Math.ceil(seconds % 60).toString()
            : Math.ceil(seconds % 60);
        timeEl.innerText = `${min}:${sec}`;
      }
      setFileLoaded(true);
    });
  }, []);

  const getText: () => string = () => {
    const text = document.getElementsByTagName("textarea")?.[0]?.value;
    return text
      .replace(/[^A-Za-z\s]/g, "")
      .toUpperCase()
      .replaceAll("\n", " ");
  };

  const getNote: (value: number) => Pitch = (value) => {
    // setup
    const ranges = {
      cmajor: ["C", "D", "E", "F", "G", "A", "B"],
      chromatic: [
        "C",
        "C#",
        "D",
        "D#",
        "E",
        "F",
        "F#",
        "G",
        "G#",
        "A",
        "A#",
        "B",
      ],
      arpeggios: ["C", "E", "G"],
      cminor: ["C", "D", "Eb", "F", "G", "A", "Bb"],
    };
    const noteRange = ranges[selectedInterval.current as keyof typeof ranges];
    const providedOctave = Number(
      (document.getElementById("octave-select") as HTMLInputElement).value
    );
    const startingOctave = isNaN(providedOctave) ? 3 : providedOctave;

    // map
    const note = noteRange[value % noteRange.length];
    const octave = Math.floor(value / noteRange.length) + startingOctave;

    // concatenate
    if (value < 0 || value > 25) {
      return "C1";
    }
    const pitch = `${note}${octave}` as Pitch;
    return pitch;
  };

  const mapText: (text: string) => Array<Array<string>> = (text) => {
    // "A" = 65, "Z" = 90, " " = 32
    const words = text.split(" ");
    return words.map((word) =>
      word.split("").map((char) => getNote(char.charCodeAt(0) - 65))
    );
  };

  const createMusic: (notes: Array<Array<string>>) => any = (notes) => {
    const track = new MidiWriter.Track();
    const bpm =
      Number(
        (document.getElementById("tempo-select") as HTMLInputElement).value
      ) ?? 200;
    const wait = (document.getElementById("rest-select") as HTMLInputElement)
      .checked;
    track.setTempo(bpm, 0);
    track.addEvent(
      notes
        .map((word, index) => {
          const pitch = word as Pitch[];
          const noteEvent = new MidiWriter.NoteEvent({
            pitch,
            duration: "4",
            sequential: true,
          });
          return wait && index !== notes.length - 1
            ? [
                noteEvent,
                new MidiWriter.NoteEvent({
                  pitch: ["C0"],
                  duration: "4",
                  velocity: 0,
                }),
              ]
            : [noteEvent];
        })
        .flat(),
      () => ({ sequential: true })
    );
    const write = new MidiWriter.Writer(track);
    return write.dataUri();
  };

  const addTextSpans: (text: string) => void = (text) => {
    const box = document.getElementById("text");
    box!.innerHTML = "";
    for (const char of text.split("")) {
      const charEl = document.createElement("span");
      charEl.innerText = char;
      if (char === " ") {
        charEl.classList.add("space");
      }
      box?.appendChild(charEl);
    }
  };
  const registerAudio = () => {
    // set loading state
    setInstrumentLoaded(false);
    document.getElementById("loading")?.classList.remove("hidden");

    // start loading instrument
    instrument.current = new Soundfont(new AudioContext(), {
      instrument: selectedInstrument.current,
    });
    instrument.current.loaded().then(() => {
      setInstrumentLoaded(true);
    });
  };

  const convertText = () => {
    // reset config
    stopAudio();
    setFileLoaded(false);

    // init player
    registerAudio();

    // generate track
    const text = getText();
    addTextSpans(text);
    const notes = mapText(text);
    const uri = createMusic(notes);

    // load track
    setDataUri(uri);
    player.current.loadDataUri(uri);

    // create score
    createScore(notes);
  };

  const playAudio = () => {
    // verify ready to play
    if (!dataUri.length) {
      console.error("Data URI not found.");
      return;
    }
    if (!instrumentLoaded) {
      console.warn("Instrument not yet loaded.");
      return;
    }

    // start playing
    if (playerStatus !== "paused") {
      player.current.loadDataUri(dataUri);
    }
    player.current.play();
    setPlayerStatus("playing");
  };

  const pauseAudio = () => {
    if (!player.current.isPlaying()) {
      console.warn("Cannot pause playback: player is not currently playing.");
      return;
    }

    player.current.pause();
    setPlayerStatus("paused");
  };

  const stopAudio = () => {
    player.current.stop();
    document
      .querySelectorAll("#text span")
      .forEach((el) => el.classList.remove("filled"));
    document
      .querySelectorAll(".vf-stavenote")
      .forEach((el) => el.classList.remove("filled"));
    setPlayerStatus("stopped");
    document.getElementById("dot")!.style.left = "0px";
  };

  const selectInstrument: React.ChangeEventHandler<HTMLSelectElement> = (
    evt
  ) => {
    selectedInstrument.current = evt.target.value;
  };

  const selectInterval: React.ChangeEventHandler<HTMLSelectElement> = (evt) => {
    selectedInterval.current = evt.target.value;
  };

  const createScore: (notes: string[][]) => void = (notes) => {
    // reset output window
    if (!document.getElementById("score")) return;
    document.getElementById("score")!.innerHTML = "";

    // setup classes
    const vf = new Factory({
      renderer: { elementId: "score", width: 1500, height: 250 },
    });

    let x = 20;
    let y = 20;

    const appendSystem = (width: number) => {
      const system = vf.System({ x, y, width, spaceBetweenStaves: 10 });
      x += width;
      return system;
    };

    const score = vf.EasyScore();
    let system = vf.System();

    const restOnSpaces = (
      document.getElementById("rest-select") as HTMLInputElement
    ).checked;

    // add notes
    const vexNotes = notes.reduce((previous, current, index) => {
      let next = [...previous, ...current.map((str) => str + "/q")];
      if (index < notes.length - 1 && restOnSpaces) {
        next.push("REST"); // treble: B4, bass: D3
      }
      return next;
    }, []);
    const measures = groupArrayByN(vexNotes, 4, "REST");
    const order = ["C", "D", "E", "F", "G", "A", "B"];
    const isTreble = (note: string) =>
      order.indexOf(note[0]) + Number(note.match(/\d/)?.[0] ?? "0") * 7 > 27; // middle C
    const trebleRest = "B4/q/r";
    const bassRest = "D3/q/r";
    const treble = measures.map((measure) =>
      measure.map((note) =>
        isTreble(note) && note !== "REST" ? note : trebleRest
      )
    );
    const bass = measures.map((measure) =>
      measure.map((note) =>
        isTreble(note) || note === "REST" ? bassRest : note
      )
    );
    console.log({ vexNotes, measures, treble, bass });

    const measureWidth = 150;

    // first measure
    system = appendSystem(measureWidth + 60);
    system
      .addStave({ voices: [score.voice(score.notes(treble[0].join(", ")))] })
      .addClef("treble")
      .addTimeSignature("4/4");
    system
      .addStave({
        voices: [
          score.voice(score.notes(bass[0].join(", "), { clef: "bass" })),
        ],
      })
      .addClef("bass")
      .addTimeSignature("4/4");
    system.addConnector("singleLeft");
    system.addConnector("singleRight");

    // remaining measures
    for (let i = 1; i < treble.length; i++) {
      system = appendSystem(measureWidth);
      system.addStave({
        voices: [score.voice(score.notes(treble[i].join(", ")))],
      });
      system.addStave({
        voices: [
          score.voice(score.notes(bass[i].join(", "), { clef: "bass" })),
        ],
      });
      system.addConnector("singleRight");
    }

    try {
      vf.draw();
    } catch (err) {
      console.log(err);
    }

    // label beat number with class
    const noteElements = document.querySelectorAll(".vf-stavenote");
    for (let i = 0; i < noteElements.length; i++) {
      noteElements[i].classList.add(`beat-${i % 4}`);
    }
  };

  useEffect(() => {
    if (instrumentLoaded && fileLoaded) {
      document.getElementById("playpause")?.classList.remove("disabled");
      document.getElementById("track")?.classList.remove("loading");
      document.getElementById("loading")?.classList.add("hidden");
    } else {
      document.getElementById("playpause")?.classList.add("disabled");
      document.getElementById("track")?.classList.add("loading");
    }
  }, [instrumentLoaded, fileLoaded]);

  useEffect(() => {
    if (playerStatus === "playing" || playerStatus === "paused") {
      document.getElementById("stop")?.classList.remove("disabled");
    } else {
      document.getElementById("stop")?.classList.add("disabled");
    }
  }, [playerStatus]);

  return (
    <>
      <h1>Musical Linguistics</h1>
      <p>Text to convert:</p>
      <textarea rows={10} cols={30} />
      <div id="convert-options">
        <div className="convert-option">
          <label htmlFor="instrument-select">Instrument Select</label>
          <select
            id="instrument-select"
            name="instrument-select"
            onChange={selectInstrument}
          >
            <option value="acoustic_grand_piano">Piano</option>
            <option value="marimba">Marimba</option>
            <option value="vibraphone">Vibraphone</option>
            <option value="acoustic_guitar_steel">Acoustic Guitar</option>
            <option value="electric_guitar_clean">Electric Guitar</option>
            <option value="clarinet">Clarinet</option>
            <option value="alto_sax">Saxophone</option>
            <option value="flute">Flute</option>
            <option value="violin">Violin</option>
            <option value="trumpet">Trumpet</option>
            <option value="choir_aahs">Choir "Aah"</option>
          </select>
        </div>

        <div className="convert-option">
          <label htmlFor="interval-select">Interval Select</label>
          <select
            id="interval-select"
            name="interval-select"
            onChange={selectInterval}
          >
            <option value="cmajor">C Major</option>
            <option value="chromatic">Chromatic</option>
            <option value="arpeggios">Arpeggios</option>
            <option value="cminor">C Minor</option>
          </select>
        </div>

        <div className="convert-option">
          <label htmlFor="octave-select">Starting Octave</label>
          <input
            id="octave-select"
            type="number"
            inputMode="numeric"
            min="1"
            max="6"
            step="1"
            defaultValue={3}
          />
        </div>

        <div className="convert-option">
          <label htmlFor="tempo-select">Tempo (bpm)</label>
          <input
            id="tempo-select"
            type="number"
            inputMode="numeric"
            min="1"
            max="1000"
            step="1"
            defaultValue={200}
          />
        </div>

        <div className="convert-option checkbox">
          <input id="rest-select" type="checkbox" />
          <label htmlFor="rest-select">Rest On Spaces</label>
        </div>
      </div>
      <input id="convert" type="button" value="Convert" onClick={convertText} />
      <div id="text"></div>
      <div id="track">
        <div id="loading" className="hidden">
          <img src={Circle} className="loadingDot" />
          <img src={Circle} className="loadingDot" />
          <img src={Circle} className="loadingDot" />
        </div>

        <img
          src={playerStatus === "playing" ? Pause : Play}
          id="playpause"
          className="iconButton disabled"
          onClick={playerStatus === "playing" ? pauseAudio : playAudio}
        />

        <div id="bar">
          <div id="dot"></div>
        </div>

        <div id="time">
          <span id="time-now">0:00</span>&nbsp;/&nbsp;
          <span id="time-total">0:00</span>
        </div>

        <img
          src={Stop}
          id="stop"
          className="iconButton disabled"
          onClick={playerStatus !== "stopped" ? stopAudio : undefined}
        />
      </div>
      <div id="score">
        <p>Click "Convert" to generate your first score</p>
      </div>
      <footer>
        <a href="https://kroljs.com" rel="noopener noreferrer" target="_blank">
          Jacob Krol
        </a>
        <p>&nbsp;&nbsp;\\&nbsp;&nbsp;</p>
        <p>&copy;{new Date().getFullYear()}</p>
      </footer>
    </>
  );
}

export default App;
